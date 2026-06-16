import { type Cue, sortCues, uid } from './types'

/** All cue times snap to tenths of a second — that's all the precision we keep. */
export const TENTH = 0.1

/** Round seconds to the nearest 1/10 s. */
export function roundTenth(t: number): number {
  return Math.round(t * 10) / 10
}

type TimePatch = Partial<Pick<Cue, 'start' | 'end'>>

/**
 * Apply a start/end change to one cue, clamped so cues can never overlap:
 * a cue's start can't precede the previous cue's end, and its end can't exceed
 * the next cue's start. Times snap to tenths. Used by both the editor inputs
 * and the timeline drag handles.
 */
export function clampTimes(
  cues: Cue[],
  id: string,
  patch: TimePatch,
  duration: number,
): Cue[] {
  const sorted = sortCues(cues)
  const i = sorted.findIndex((c) => c.id === id)
  if (i < 0) return cues

  const cue = sorted[i]
  const lower = i > 0 ? sorted[i - 1].end : 0
  const upper =
    i < sorted.length - 1
      ? sorted[i + 1].start
      : duration > 0
        ? duration
        : Number.POSITIVE_INFINITY

  let start = roundTenth(patch.start ?? cue.start)
  let end = roundTenth(patch.end ?? cue.end)

  if (patch.start != null) {
    start = Math.max(lower, Math.min(start, end - TENTH))
  }
  if (patch.end != null) {
    end = Math.min(upper, Math.max(end, start + TENTH))
  }

  return sorted.map((c) => (c.id === id ? { ...c, start, end } : c))
}

/**
 * Insert a new empty cue at `time`, finding a non-overlapping slot: if the
 * playhead is inside an existing cue, start just after it; cap the end at the
 * next cue's start (or the video duration).
 */
export function addCueAt(
  cues: Cue[],
  time: number,
  duration: number,
): { cues: Cue[]; id: string } {
  const sorted = sortCues(cues)
  let start = roundTenth(time)

  const containing = sorted.find((c) => start >= c.start && start < c.end)
  if (containing) start = containing.end

  const next = sorted.find((c) => c.start > start)
  const limit = next ? next.start : duration > 0 ? duration : start + 2
  let end = Math.min(roundTenth(start + 2), limit)
  if (end - start < TENTH) end = Math.min(limit, start + TENTH)

  const cue: Cue = { id: uid('cue'), start, end, text: '' }
  return { cues: sortCues([...sorted, cue]), id: cue.id }
}

/**
 * Normalise a freshly-ingested cue list (Whisper / imported / embedded): snap
 * to tenths and clamp each end to the next start so nothing overlaps.
 */
export function normalizeCues(cues: Cue[]): Cue[] {
  const sorted = sortCues(
    cues.map((c) => ({ ...c, start: roundTenth(c.start), end: roundTenth(c.end) })),
  )
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].end <= sorted[i].start) {
      sorted[i].end = roundTenth(sorted[i].start + TENTH)
    }
    const next = sorted[i + 1]
    if (next && sorted[i].end > next.start) {
      sorted[i].end = next.start
    }
  }
  return sorted
}
