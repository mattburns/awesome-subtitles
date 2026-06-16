import type { Cue } from '../lib/subtitles/types'

/** transformers.js model-download / load progress event (loosely typed). */
export interface ModelProgress {
  status: string
  name?: string
  file?: string
  progress?: number
  loaded?: number
  total?: number
}

// --- Whisper ASR worker protocol ---
export type AsrRequest =
  | { type: 'load' }
  | { type: 'transcribe'; pcm: Float32Array; language?: string }

export type AsrResponse =
  | { type: 'progress'; data: ModelProgress }
  | { type: 'ready' }
  | { type: 'done'; cues: Cue[] }
  | { type: 'error'; message: string }

// --- Frame-captioning worker protocol ---
export type CaptionRequest =
  | { type: 'load' }
  | { type: 'caption'; id: number; time: number; bitmap: ImageBitmap }

export type CaptionResponse =
  | { type: 'progress'; data: ModelProgress }
  | { type: 'ready' }
  | { type: 'caption'; id: number; time: number; text: string }
  | { type: 'error'; message: string }
