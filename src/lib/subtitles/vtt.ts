import { type Cue, uid } from './types'
import { formatTimestamp, parseTimestamp } from './time'

const TIMING_RE = /(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}|\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3}|\d{1,2}:\d{2}[.,]\d{1,3})/

/**
 * Parse WebVTT text into cues. Cue settings after the timing (e.g. `line:0`,
 * `align:start`) and STYLE/NOTE/REGION blocks are skipped — we keep plain text.
 */
export function parseVtt(input: string): Cue[] {
  const text = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!text) return []

  const cues: Cue[] = []
  for (const block of text.split(/\n{2,}/)) {
    if (/^(WEBVTT|STYLE|NOTE|REGION)\b/.test(block)) continue

    const lines = block.split('\n')
    // An optional cue identifier line may precede the timing line.
    const timingIndex = lines.findIndex((l) => TIMING_RE.test(l))
    if (timingIndex === -1) continue

    const timing = lines[timingIndex].match(TIMING_RE)!
    const start = parseTimestamp(timing[1])
    const end = parseTimestamp(timing[2])
    const body = lines
      .slice(timingIndex + 1)
      .join('\n')
      .trim()
    cues.push({ id: uid('cue'), start, end, text: stripTags(body) })
  }
  return cues
}

/** Serialize cues to WebVTT text (used for the live `<track>` preview too). */
export function serializeVtt(cues: Cue[]): string {
  const body = cues
    .map((cue) => {
      const start = formatTimestamp(cue.start, false)
      const end = formatTimestamp(cue.end, false)
      return `${start} --> ${end}\n${cue.text}\n`
    })
    .join('\n')
  return `WEBVTT\n\n${body}`
}

/** Produce a blob URL for a `<track src>` from cues. Caller revokes it. */
export function vttObjectUrl(cues: Cue[]): string {
  const blob = new Blob([serializeVtt(cues)], { type: 'text/vtt' })
  return URL.createObjectURL(blob)
}

function stripTags(text: string): string {
  // Remove inline VTT tags like <c>, <v Roger>, <00:00:01.000>.
  return text.replace(/<\/?[^>]+>/g, '')
}
