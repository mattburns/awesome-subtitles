import { transcribe } from './asr'
import { captionFrames } from './caption'
import { getFFmpeg } from './ffmpeg/service'
import { parseSrt } from './subtitles/srt'
import { type SubtitleTrack, uid } from './subtitles/types'

export type PipelineStage =
  | 'idle'
  | 'loading-ffmpeg'
  | 'probing'
  | 'extracting-subs'
  | 'extracting-audio'
  | 'transcribing'
  | 'captioning'
  | 'done'
  | 'error'

export interface PipelineStatus {
  stage: PipelineStage
  message: string
  /** 0..1 when a fine-grained progress is available. */
  progress?: number
}

export type StatusFn = (status: PipelineStatus) => void

function trackLabel(prefix: string, language: string | undefined, index: number): string {
  const lang = language ? ` (${language})` : ''
  const n = index > 0 ? ` #${index + 1}` : ''
  return `${prefix}${lang}${n}`
}

/**
 * The core decision flow:
 *   1. extract any embedded text subtitle tracks; if found, use them;
 *   2. else, if there's audio, transcribe it with Whisper;
 *   3. else (or if Whisper found nothing), describe frames every 5 seconds.
 * Reports progress through `onStatus` and resolves with the resulting tracks.
 */
export async function generateSubtitles(
  file: File,
  src: string,
  duration: number,
  onStatus: StatusFn,
): Promise<SubtitleTrack[]> {
  const ffmpeg = getFFmpeg()

  onStatus({ stage: 'loading-ffmpeg', message: 'Loading the media engine…' })
  await ffmpeg.load()

  onStatus({ stage: 'probing', message: 'Inspecting the file…' })
  const streams = await ffmpeg.probe(file)

  onStatus({ stage: 'extracting-subs', message: 'Looking for embedded subtitles…' })
  const embedded = await ffmpeg.extractSubtitles(file, streams)
  if (embedded.length > 0) {
    onStatus({ stage: 'done', message: `Loaded ${embedded.length} embedded track(s).` })
    return embedded.map((e, i) => ({
      id: uid('track'),
      label: trackLabel('Embedded', e.stream.language, i),
      language: e.stream.language,
      origin: 'embedded',
      cues: parseSrt(e.srt),
    }))
  }

  const hasAudio = streams.some((s) => s.kind === 'audio')
  if (hasAudio) {
    onStatus({ stage: 'extracting-audio', message: 'Extracting audio…' })
    const pcm = await ffmpeg.extractAudioPcm(file)

    onStatus({ stage: 'transcribing', message: 'Transcribing speech with Whisper…' })
    const cues = await transcribe(pcm, {
      onProgress: (p) =>
        onStatus({
          stage: 'transcribing',
          message: p.file ? `Loading model: ${p.file}` : 'Transcribing speech with Whisper…',
          progress: p.progress != null ? p.progress / 100 : undefined,
        }),
    })
    if (cues.length > 0) {
      onStatus({ stage: 'done', message: `Transcribed ${cues.length} cue(s).` })
      return [{ id: uid('track'), label: 'Speech (Whisper)', origin: 'whisper', cues }]
    }
  }

  onStatus({
    stage: 'captioning',
    message: hasAudio
      ? 'No speech detected — describing frames instead…'
      : 'No audio — describing frames instead…',
  })
  const cues = await captionFrames(src, duration, {
    intervalSec: 5,
    onProgress: (fraction) =>
      onStatus({
        stage: 'captioning',
        message: `Describing frames… ${Math.round(fraction * 100)}%`,
        progress: fraction,
      }),
  })
  onStatus({ stage: 'done', message: `Described ${cues.length} frame(s).` })
  return [{ id: uid('track'), label: 'Frame descriptions', origin: 'caption', cues }]
}
