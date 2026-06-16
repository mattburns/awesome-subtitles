import { type Cue, sortCues, uid } from '../subtitles/types'
import { extractFrames, sampleTimes } from '../video/frames'
import type {
  CaptionRequest,
  CaptionResponse,
  ModelProgress,
} from '../../workers/messages'

export interface CaptionOptions {
  /** Seconds between sampled frames. Defaults to 5. */
  intervalSec?: number
  /** Model load / per-frame progress (0..1 across all frames). */
  onProgress?: (fraction: number, p?: ModelProgress) => void
}

/**
 * Fallback subtitles for silent video: sample a frame every `intervalSec`,
 * describe it, and turn each description into a cue spanning until the next
 * sample. Runs the vision model in a worker, one frame at a time.
 */
export async function captionFrames(
  src: string,
  duration: number,
  options: CaptionOptions = {},
): Promise<Cue[]> {
  const interval = options.intervalSec ?? 5
  const times = sampleTimes(duration, interval)
  if (times.length === 0) return []

  const worker = new Worker(
    new URL('../../workers/caption.worker.ts', import.meta.url),
    { type: 'module' },
  )

  const pending = new Map<number, (text: string) => void>()
  let nextId = 0
  let done = 0

  worker.onmessage = (event: MessageEvent<CaptionResponse>) => {
    const msg = event.data
    if (msg.type === 'caption') {
      pending.get(msg.id)?.(msg.text)
      pending.delete(msg.id)
    } else if (msg.type === 'progress') {
      options.onProgress?.(done / times.length, msg.data)
    }
  }

  const captionOne = (time: number, bitmap: ImageBitmap): Promise<string> =>
    new Promise((resolve) => {
      const id = nextId++
      pending.set(id, resolve)
      const req: CaptionRequest = { type: 'caption', id, time, bitmap }
      worker.postMessage(req, [bitmap])
    })

  const cues: Cue[] = []
  try {
    await extractFrames(src, times, async (time, bitmap) => {
      const text = await captionOne(time, bitmap)
      const next = times[times.indexOf(time) + 1] ?? duration
      if (text) cues.push({ id: uid('cue'), start: time, end: next, text })
      done += 1
      options.onProgress?.(done / times.length)
    })
  } finally {
    worker.terminate()
  }
  return sortCues(cues)
}
