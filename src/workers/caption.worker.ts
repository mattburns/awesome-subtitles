/// <reference lib="webworker" />
import { pipeline, RawImage } from '@huggingface/transformers'
import type { CaptionRequest, CaptionResponse, ModelProgress } from './messages'

// Small, reliable image-captioning model that runs well in the browser.
const MODEL_ID = 'Xenova/vit-gpt2-image-captioning'

type CaptionResult = { generated_text: string }
type CaptionCallable = (image: RawImage) => Promise<CaptionResult | CaptionResult[]>

let captioner: CaptionCallable | null = null

function post(message: CaptionResponse) {
  self.postMessage(message)
}

async function getCaptioner(): Promise<CaptionCallable> {
  if (captioner) return captioner
  const progress_callback = (data: ModelProgress) => post({ type: 'progress', data })
  try {
    captioner = (await pipeline('image-to-text', MODEL_ID, {
      device: 'webgpu',
      progress_callback,
    })) as unknown as CaptionCallable
  } catch {
    captioner = (await pipeline('image-to-text', MODEL_ID, {
      progress_callback,
    })) as unknown as CaptionCallable
  }
  return captioner
}

/** Convert a transferred ImageBitmap into a transformers.js RawImage. */
function bitmapToRawImage(bitmap: ImageBitmap): RawImage {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  return new RawImage(new Uint8ClampedArray(data), width, height, 4)
}

self.onmessage = async (event: MessageEvent<CaptionRequest>) => {
  const msg = event.data
  try {
    if (msg.type === 'load') {
      await getCaptioner()
      post({ type: 'ready' })
      return
    }

    const caption = await getCaptioner()
    const image = bitmapToRawImage(msg.bitmap)
    const result = await caption(image)
    const text = (Array.isArray(result) ? result[0] : result).generated_text.trim()
    post({ type: 'caption', id: msg.id, time: msg.time, text })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
