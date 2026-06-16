import { type Cue, uid } from './types'
import { formatTimestamp, parseTimestamp } from './time'

const TIMING_RE = /(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}|\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}|\d{1,2}:\d{2}[.,]\d{1,3})/

/** Parse SubRip (.srt) text into cues. Tolerant of CRLF and missing indices. */
export function parseSrt(input: string): Cue[] {
  const text = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!text) return []

  const cues: Cue[] = []
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n')
    // An optional numeric index line may precede the timing line.
    let i = 0
    if (lines[i] !== undefined && /^\d+$/.test(lines[i].trim())) i++

    const timing = lines[i]?.match(TIMING_RE)
    if (!timing) continue
    i++

    const start = parseTimestamp(timing[1])
    const end = parseTimestamp(timing[2])
    const body = lines.slice(i).join('\n').trim()
    cues.push({ id: uid('cue'), start, end, text: body })
  }
  return cues
}

/** Serialize cues to SubRip (.srt) text. */
export function serializeSrt(cues: Cue[]): string {
  return cues
    .map((cue, index) => {
      const start = formatTimestamp(cue.start, true)
      const end = formatTimestamp(cue.end, true)
      return `${index + 1}\n${start} --> ${end}\n${cue.text}\n`
    })
    .join('\n')
}
