/** Timestamp helpers shared by the SRT and WebVTT codecs and the UI. */

/**
 * Parse a subtitle timestamp into seconds.
 * Accepts both SRT (`00:00:01,000`) and VTT (`00:00:01.000`) styles, and the
 * VTT short form without hours (`01:02.500`).
 */
export function parseTimestamp(raw: string): number {
  const cleaned = raw.trim().replace(',', '.')
  const parts = cleaned.split(':')
  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`Unrecognised timestamp: "${raw}"`)
  }
  const seconds = parts.map(Number)
  if (seconds.some((n) => Number.isNaN(n))) {
    throw new Error(`Unrecognised timestamp: "${raw}"`)
  }
  // [hh, mm, ss.mmm] or [mm, ss.mmm]
  return parts.length === 3
    ? seconds[0] * 3600 + seconds[1] * 60 + seconds[2]
    : seconds[0] * 60 + seconds[1]
}

/**
 * Format seconds as `HH:MM:SS.mmm` (VTT) or `HH:MM:SS,mmm` (SRT, when
 * `comma` is true).
 */
export function formatTimestamp(totalSeconds: number, comma = false): string {
  const t = Math.max(0, totalSeconds)
  const hours = Math.floor(t / 3600)
  const minutes = Math.floor((t % 3600) / 60)
  const secs = Math.floor(t % 60)
  const millis = Math.round((t - Math.floor(t)) * 1000)
  const hh = String(hours).padStart(2, '0')
  const mm = String(minutes).padStart(2, '0')
  const ss = String(secs).padStart(2, '0')
  const ms = String(millis).padStart(3, '0')
  return `${hh}:${mm}:${ss}${comma ? ',' : '.'}${ms}`
}

/** Compact clock for the UI scrubber, e.g. `1:02.5`. */
export function formatClock(totalSeconds: number): string {
  const t = Math.max(0, totalSeconds)
  const minutes = Math.floor(t / 60)
  const secs = (t % 60).toFixed(1)
  return `${minutes}:${secs.padStart(4, '0')}`
}
