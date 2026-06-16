# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`awesome-subtitles` generates, edits, and burns subtitles for a video **entirely in the browser** — the video never leaves the user's machine, and the app is a static site (deployable to GitHub Pages, no backend).

The user flow: open a video → the app finds embedded subtitle tracks, or transcribes speech with Whisper, or (for silent video) describes frames every 5s → edit cues on a timeline synced to the player → export with **toggleable** (soft) or **burnt-in** subtitles.

## Commands

```bash
npm install        # install deps
npm run dev        # Vite dev server (sets COOP/COEP headers for SharedArrayBuffer)
npm run build      # tsc -b type-check, then vite build → dist/
npm run preview    # serve the production build locally (also sets COOP/COEP)
npm run lint       # eslint (flat config, typescript-eslint)
npm run typecheck  # tsc -b --noEmit
```

There is no test suite yet. Deployment is automatic via `.github/workflows/deploy.yml` on push to `main`.

## Architecture

Everything heavy runs client-side through WASM/WebGPU. There is no server.

**The decision flow lives in `src/lib/pipeline.ts`** (`generateSubtitles`) and is the single most important file to understand. Given a file it: (1) extracts embedded text subtitle tracks; if none, (2) transcribes audio with Whisper; if there's no audio or Whisper returns nothing, (3) captions sampled frames. It reports progress via an `onStatus` callback and returns `SubtitleTrack[]`. `src/App.tsx` runs it automatically once a video's metadata has loaded.

**Three engines, each isolated behind a `src/lib/<engine>` module:**

- `src/lib/ffmpeg/service.ts` — singleton wrapper around **ffmpeg.wasm**. Probes streams (parses ffmpeg's log output — ffmpeg.wasm has no ffprobe), extracts embedded subs to SRT, decodes audio to 16 kHz mono f32 PCM for Whisper, and does both exports. ffmpeg.wasm runs in its own worker, so calls don't block the UI. Core is loaded at runtime from a CDN (not bundled). **Use the ESM core (`/dist/esm/`), not UMD** — @ffmpeg/ffmpeg's worker is a module worker that loads the core via `import()` and needs its `export default`; the UMD build fails with "failed to import ffmpeg-core.js". Runs single-threaded; the multi-threaded core is auto-selected only if the page is cross-origin isolated (it isn't, by default — see below).
- `src/lib/asr/` + `src/workers/asr.worker.ts` — **Whisper via transformers.js** (`@huggingface/transformers`) in a dedicated worker. `transcribe(pcm)` spins up the worker, gets timestamped cues back, tears it down.
- `src/lib/caption/` + `src/workers/caption.worker.ts` — **image captioning via transformers.js** in a worker. `src/lib/video/frames.ts` seeks a detached `<video>` and grabs downscaled `ImageBitmap`s (transferable) on the main thread; the worker captions them one at a time.

Worker message shapes are typed in `src/workers/messages.ts`.

**Subtitle core (`src/lib/subtitles/`)** is the shared data model every engine and component reads/writes: the `Cue`/`SubtitleTrack` types, SRT + WebVTT parse/serialize, and time helpers. All times are **seconds (float)**. Cues carry stable `uid()` ids used as React keys.

**UI (`src/components/`)** is plain React state in `App.tsx` (no state library): `FileDropzone`, `VideoPlayer` (renders the current cue as a styled overlay — this is also the burn-in preview), `Timeline` (cue blocks + draggable playhead, positioned by `time/duration`), `CueEditor`, `ExportPanel`.

## Critical constraints (don't break these)

- **No cross-origin isolation (deliberate).** We do **not** set COOP/COEP and there is **no service worker**. Multi-threaded ffmpeg would need `SharedArrayBuffer` (hence cross-origin isolation), but on GitHub Pages the only way to get it is a header-injecting service worker (coi-serviceworker), which proved fragile here — it intercepted and failed fetches, and COEP `require-corp` risks blocking the cross-origin model/CDN downloads. So we run **single-threaded** and skip isolation entirely. `index.html` carries a one-time cleanup that unregisters any stale coi-serviceworker from earlier deploys — leave it until you're confident no client still has the old SW. To re-enable multi-threading, you'd need reliable COOP/COEP (e.g. self-host every asset same-origin) and the MT core would activate automatically via the `crossOriginIsolated` check in `service.ts`.
- **GitHub Pages base path.** `vite.config.ts` sets `base` to `/awesome-subtitles/` (override with the `VITE_BASE` env var for a custom domain / user page). Use root-relative or imported asset URLs so the base is applied; don't hard-code `/`.
- **Don't bundle models or ffmpeg core.** Whisper/caption models load from the Hugging Face CDN and cache in the browser; ffmpeg core loads from unpkg. Bundling them would blow past GitHub Pages' 100 MB/file limit. The ONNX runtime WASM (~21 MB) is emitted to `dist/assets` and only fetched when the WASM backend is used.
- **Burn-in is the slow path** — it re-encodes video with libx264 in WASM, single-threaded and CPU-only, so it's slow on long/HD clips. Soft-sub export is a stream copy and fast. Don't conflate them.

## Conventions

- 2-space indent, no semicolons, single quotes (match existing files).
- Engine modules expose plain async functions / a small service object; keep DOM and React out of `src/lib/**` except `src/lib/video/frames.ts`, which needs a `<video>` element.
- Heavy work belongs in a worker. Add new ML work as a worker with a typed protocol in `src/workers/messages.ts`, wrapped by a `src/lib/**` helper.
- To swap models, change `MODEL_ID` in the relevant worker (e.g. whisper-base → whisper-small for accuracy, or whisper-tiny for speed).
