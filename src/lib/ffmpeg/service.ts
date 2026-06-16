import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import {
  type ExtractedSubtitle,
  type StreamInfo,
  type StreamKind,
  TEXT_SUBTITLE_CODECS,
} from './types'

// ffmpeg.wasm core is loaded at runtime (not bundled). We use the ESM build:
// @ffmpeg/ffmpeg's worker is a module worker, so it loads the core with
// dynamic import() and needs the ESM core's `export default` — the UMD build
// has no default export and fails with "failed to import ffmpeg-core.js".
//
// We use the single-threaded core. The multi-threaded core needs
// SharedArrayBuffer (cross-origin isolation), which isn't reliably available
// on GitHub Pages — see the note in index.html / CLAUDE.md. The MT build is
// auto-selected only if the page happens to be cross-origin isolated.
const CORE_VERSION = '0.12.10'
const MT_BASE = `https://unpkg.com/@ffmpeg/core-mt@${CORE_VERSION}/dist/esm`
const ST_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`

const STREAM_RE =
  /Stream #0:(\d+)(?:\[[^\]]*\])?(?:\((\w+)\))?: (Video|Audio|Subtitle): (\w+)/

export type ProgressFn = (progress: number) => void

/**
 * Thin wrapper around ffmpeg.wasm. One instance is reused for the whole
 * session; ffmpeg runs in its own worker so calls don't block the UI thread.
 */
export class FFmpegService {
  private ffmpeg = new FFmpeg()
  private loaded = false
  private logBuffer: string[] = []
  /** True when the multi-threaded core could be used. */
  multiThreaded = false

  async load(onLog?: (line: string) => void): Promise<void> {
    if (this.loaded) return

    this.ffmpeg.on('log', ({ message }) => {
      this.logBuffer.push(message)
      onLog?.(message)
    })

    this.multiThreaded =
      typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated
    const base = this.multiThreaded ? MT_BASE : ST_BASE

    await this.ffmpeg.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      ...(this.multiThreaded
        ? {
            workerURL: await toBlobURL(
              `${base}/ffmpeg-core.worker.js`,
              'text/javascript',
            ),
          }
        : {}),
    })
    this.loaded = true
  }

  /** Run ffmpeg, capturing only the log lines it produces during the call. */
  private async run(args: string[]): Promise<string[]> {
    const start = this.logBuffer.length
    await this.ffmpeg.exec(args)
    return this.logBuffer.slice(start)
  }

  /** Inspect the container and list its video/audio/subtitle streams. */
  async probe(file: File): Promise<StreamInfo[]> {
    await this.ffmpeg.writeFile('probe.bin', await fetchFile(file))
    // `-i` with no output makes ffmpeg dump stream info then exit non-zero;
    // we ignore the failure and parse the captured log.
    const lines = await this.run(['-i', 'probe.bin']).catch(() => this.logBuffer)
    await this.ffmpeg.deleteFile('probe.bin').catch(() => {})

    const kindMap: Record<string, StreamKind> = {
      Video: 'video',
      Audio: 'audio',
      Subtitle: 'subtitle',
    }
    const streams: StreamInfo[] = []
    for (const line of lines) {
      const m = line.match(STREAM_RE)
      if (!m) continue
      streams.push({
        index: Number(m[1]),
        language: m[2],
        kind: kindMap[m[3]],
        codec: m[4],
      })
    }
    return streams
  }

  /** Extract every text-based embedded subtitle track as SRT. */
  async extractSubtitles(
    file: File,
    streams: StreamInfo[],
  ): Promise<ExtractedSubtitle[]> {
    const subStreams = streams.filter(
      (s) => s.kind === 'subtitle' && TEXT_SUBTITLE_CODECS.has(s.codec),
    )
    if (subStreams.length === 0) return []

    await this.ffmpeg.writeFile('in.bin', await fetchFile(file))
    const out: ExtractedSubtitle[] = []
    for (const stream of subStreams) {
      const name = `sub_${stream.index}.srt`
      try {
        await this.run(['-i', 'in.bin', '-map', `0:${stream.index}`, '-c:s', 'srt', name])
        const data = await this.ffmpeg.readFile(name)
        out.push({ stream, srt: new TextDecoder().decode(data as Uint8Array) })
        await this.ffmpeg.deleteFile(name).catch(() => {})
      } catch {
        // Skip a stream that fails to convert (e.g. unexpected bitmap sub).
      }
    }
    await this.ffmpeg.deleteFile('in.bin').catch(() => {})
    return out
  }

  /**
   * Decode the first audio stream to 16 kHz mono 32-bit float PCM — exactly
   * what the Whisper pipeline expects as input.
   */
  async extractAudioPcm(file: File): Promise<Float32Array> {
    await this.ffmpeg.writeFile('in.bin', await fetchFile(file))
    await this.run([
      '-i', 'in.bin',
      '-vn',
      '-ac', '1',
      '-ar', '16000',
      '-f', 'f32le',
      '-acodec', 'pcm_f32le',
      'audio.pcm',
    ])
    const data = (await this.ffmpeg.readFile('audio.pcm')) as Uint8Array
    await this.ffmpeg.deleteFile('audio.pcm').catch(() => {})
    await this.ffmpeg.deleteFile('in.bin').catch(() => {})
    // Copy into a tightly-aligned buffer before viewing as Float32.
    const aligned = new Uint8Array(data.length)
    aligned.set(data)
    return new Float32Array(aligned.buffer)
  }

  /**
   * Toggleable subtitles: keep the source's video + audio, drop any existing
   * subtitle tracks, and add the edited subtitles as a single soft track.
   * Fast — video/audio are stream-copied, not re-encoded.
   *
   * We map `0:v?`/`0:a?` (rather than `0`) so the source's own subtitle
   * streams are replaced, not duplicated. The `?` keeps it working for files
   * with no audio. (Side effect: data/attachment/chapter streams are dropped.)
   */
  async exportWithSoftSubs(
    file: File,
    srt: string,
    outName = 'output.mp4',
    onProgress?: ProgressFn,
  ): Promise<Uint8Array> {
    const subCodec = outName.endsWith('.mkv')
      ? 'srt'
      : outName.endsWith('.webm')
        ? 'webvtt'
        : 'mov_text'
    return this.exportInternal(
      file,
      srt,
      [
        '-i', 'in.bin',
        '-i', 'subs.srt',
        '-map', '0:v?',
        '-map', '0:a?',
        '-map', '1',
        '-c', 'copy',
        '-c:s', subCodec,
        '-metadata:s:s:0', 'language=eng',
        outName,
      ],
      outName,
      onProgress,
    )
  }

  private async exportInternal(
    file: File,
    srt: string,
    args: string[],
    outName: string,
    onProgress?: ProgressFn,
  ): Promise<Uint8Array> {
    const handler = onProgress
      ? ({ progress }: { progress: number }) => onProgress(progress)
      : undefined
    if (handler) this.ffmpeg.on('progress', handler)
    try {
      await this.ffmpeg.writeFile('in.bin', await fetchFile(file))
      await this.ffmpeg.writeFile('subs.srt', new TextEncoder().encode(srt))
      await this.run(args)
      const data = (await this.ffmpeg.readFile(outName)) as Uint8Array
      await this.ffmpeg.deleteFile('in.bin').catch(() => {})
      await this.ffmpeg.deleteFile('subs.srt').catch(() => {})
      await this.ffmpeg.deleteFile(outName).catch(() => {})
      return data
    } finally {
      if (handler) this.ffmpeg.off('progress', handler)
    }
  }
}

let singleton: FFmpegService | null = null

/** Shared, lazily-loaded ffmpeg instance for the app. */
export function getFFmpeg(): FFmpegService {
  if (!singleton) singleton = new FFmpegService()
  return singleton
}
