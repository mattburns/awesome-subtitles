import { transcribe } from './asr'
import { getFFmpeg } from './ffmpeg/service'
import { normalizeCues } from './subtitles/edit'
import { parseSrt } from './subtitles/srt'
import { type SubtitleTrack, uid } from './subtitles/types'

export type PipelineStage =
  | 'idle'
  | 'loading-ffmpeg'
  | 'probing'
  | 'extracting-subs'
  | 'extracting-audio'
  | 'transcribing'
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

function emptyManualTrack(): SubtitleTrack {
  return { id: uid('track'), label: 'Subtitles (manual)', origin: 'manual', cues: [] }
}

/**
 * The decision flow:
 *   1. extract any embedded text subtitle tracks; if found, use them;
 *   2. else, if there's audio, transcribe it with Whisper;
 *   3. else (or if Whisper found nothing), start with an empty track for the
 *      user to type subtitles into manually.
 * All ingested cues are snapped to tenths and de-overlapped. Reports progress
 * through `onStatus` and resolves with the resulting tracks.
 */
export async function generateSubtitles(
  file: File,
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
      cues: normalizeCues(parseSrt(e.srt)),
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
      return [
        { id: uid('track'), label: 'Speech (Whisper)', origin: 'whisper', cues: normalizeCues(cues) },
      ]
    }
  }

  onStatus({
    stage: 'done',
    message: hasAudio
      ? 'No speech detected — add subtitles manually.'
      : 'No audio — add subtitles manually.',
  })
  return [emptyManualTrack()]
}
