export * from './types'
export * from './time'
export { parseSrt, serializeSrt } from './srt'
export { parseVtt, serializeVtt, vttObjectUrl } from './vtt'

import type { Cue } from './types'
import { parseSrt } from './srt'
import { parseVtt } from './vtt'

/** Detect format from filename/content and parse to cues. */
export function parseSubtitles(filename: string, content: string): Cue[] {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.vtt') || content.trimStart().startsWith('WEBVTT')) {
    return parseVtt(content)
  }
  // Default to SRT for .srt and unknown extensions.
  return parseSrt(content)
}
