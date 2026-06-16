import type { Cue } from '../subtitles/types'
import type { AsrRequest, AsrResponse, ModelProgress } from '../../workers/messages'

export interface TranscribeOptions {
  /** Force a language (e.g. "en"); omit to let Whisper auto-detect. */
  language?: string
  /** Model download / inference progress. */
  onProgress?: (p: ModelProgress) => void
}

function createWorker(): Worker {
  return new Worker(new URL('../../workers/asr.worker.ts', import.meta.url), {
    type: 'module',
  })
}

/**
 * Transcribe 16 kHz mono PCM to timestamped cues with Whisper. Spins up a
 * dedicated worker for the run and tears it down afterwards.
 */
export function transcribe(
  pcm: Float32Array,
  options: TranscribeOptions = {},
): Promise<Cue[]> {
  return new Promise((resolve, reject) => {
    const worker = createWorker()
    worker.onmessage = (event: MessageEvent<AsrResponse>) => {
      const msg = event.data
      switch (msg.type) {
        case 'progress':
          options.onProgress?.(msg.data)
          break
        case 'done':
          worker.terminate()
          resolve(msg.cues)
          break
        case 'error':
          worker.terminate()
          reject(new Error(msg.message))
          break
      }
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(e.error ?? new Error(e.message))
    }
    const request: AsrRequest = { type: 'transcribe', pcm, language: options.language }
    // Transfer the PCM buffer to avoid a copy.
    worker.postMessage(request, [pcm.buffer])
  })
}
