/** Extract still frames from a video at the given timestamps, in the browser. */

const MAX_FRAME_WIDTH = 512 // downscale before captioning to cut work + transfer

function once(target: EventTarget, event: string): Promise<void> {
  return new Promise((resolve) => {
    target.addEventListener(event, () => resolve(), { once: true })
  })
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }
    video.addEventListener('seeked', onSeeked)
    video.currentTime = Math.min(time, Math.max(0, video.duration - 0.05))
  })
}

/**
 * Seek a detached video element to each timestamp and yield a downscaled
 * ImageBitmap. Bitmaps are transferable, so the caller can hand them straight
 * to the captioning worker. The element is torn down when done.
 */
export async function extractFrames(
  src: string,
  times: number[],
  onFrame: (time: number, bitmap: ImageBitmap) => Promise<void>,
): Promise<void> {
  const video = document.createElement('video')
  video.src = src
  video.muted = true
  video.preload = 'auto'
  await once(video, 'loadeddata')

  const scale = Math.min(1, MAX_FRAME_WIDTH / (video.videoWidth || MAX_FRAME_WIDTH))
  const width = Math.round((video.videoWidth || MAX_FRAME_WIDTH) * scale)
  const height = Math.round((video.videoHeight || MAX_FRAME_WIDTH) * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  try {
    for (const time of times) {
      await seek(video, time)
      ctx.drawImage(video, 0, 0, width, height)
      const bitmap = await createImageBitmap(canvas)
      await onFrame(time, bitmap)
    }
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}

/** Build evenly-spaced timestamps across a duration, e.g. every 5 seconds. */
export function sampleTimes(duration: number, intervalSec: number): number[] {
  const times: number[] = []
  for (let t = 0; t < duration; t += intervalSec) times.push(t)
  return times
}
