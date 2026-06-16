/// <reference lib="webworker" />
import { pipeline } from '@huggingface/transformers'
import { type Cue, uid } from '../lib/subtitles/types'
import type { AsrRequest, AsrResponse, ModelProgress } from './messages'

// Whisper base offers a good size/accuracy trade-off for in-browser use.
// Swap for whisper-small / whisper-tiny to trade accuracy for speed.
const MODEL_ID = 'onnx-community/whisper-base'

// Loosely-typed view of what the pipeline returns with return_timestamps.
type Chunk = { timestamp: [number, number | null]; text: string }
type AsrCallable = (
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<{ text: string; chunks?: Chunk[] }>

let transcriber: AsrCallable | null = null

function post(message: AsrResponse) {
  self.postMessage(message)
}

async function getTranscriber(): Promise<AsrCallable> {
  if (transcriber) return transcriber
  const progress_callback = (data: ModelProgress) => post({ type: 'progress', data })
  try {
    // Prefer WebGPU; fall back to the WASM backend where it isn't available.
    transcriber = (await pipeline('automatic-speech-recognition', MODEL_ID, {
      device: 'webgpu',
      progress_callback,
    })) as unknown as AsrCallable
  } catch {
    transcriber = (await pipeline('automatic-speech-recognition', MODEL_ID, {
      progress_callback,
    })) as unknown as AsrCallable
  }
  return transcriber
}

self.onmessage = async (event: MessageEvent<AsrRequest>) => {
  const msg = event.data
  try {
    if (msg.type === 'load') {
      await getTranscriber()
      post({ type: 'ready' })
      return
    }

    const transcribe = await getTranscriber()
    const output = await transcribe(msg.pcm, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
      language: msg.language,
    })

    const chunks = output.chunks ?? []
    const cues: Cue[] = chunks
      .filter((c) => c.timestamp?.[0] != null && c.text.trim())
      .map((c) => ({
        id: uid('cue'),
        start: c.timestamp[0],
        end: c.timestamp[1] ?? c.timestamp[0] + 2,
        text: c.text.trim(),
      }))
    post({ type: 'done', cues })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
