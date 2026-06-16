export type StreamKind = 'video' | 'audio' | 'subtitle'

export interface StreamInfo {
  /** Absolute stream index within the container (the N in `0:N`). */
  index: number
  kind: StreamKind
  /** ffmpeg codec name, e.g. "subrip", "aac", "h264". */
  codec: string
  /** ISO language tag when the container declares one. */
  language?: string
}

export interface ExtractedSubtitle {
  stream: StreamInfo
  /** SubRip text, ready to hand to parseSrt(). */
  srt: string
}

/** Text subtitle codecs we can losslessly convert to SRT for editing. */
export const TEXT_SUBTITLE_CODECS = new Set([
  'subrip',
  'srt',
  'ass',
  'ssa',
  'mov_text',
  'webvtt',
  'text',
])
