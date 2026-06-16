# awesome-subtitles

Automatically generate editable subtitles to embed or burn — **entirely in your browser**. Your video never leaves your machine, and there's no backend: it's a static site that runs Whisper, image captioning, and ffmpeg as WebAssembly / WebGPU.

## What it does

1. **Open a video** (drag-and-drop or browse).
2. **Get subtitles automatically**, in this order:
   - extract any **embedded** subtitle tracks already in the file; otherwise
   - **transcribe speech** with Whisper; otherwise (silent video)
   - **describe the frames** every 5 seconds and use those as captions.
3. **Edit** cues — text and timing — on a timeline synced to the video player.
4. **Export** with either **toggleable** (soft) subtitles (fast, stream-copied) or **burnt-in** subtitles (re-encoded into the picture).

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
```

Requires a modern browser. WebGPU (Chrome/Edge, recent Safari/Firefox) makes the ML steps much faster; otherwise they fall back to WASM.

## Deploy

Pushing to `main` builds and publishes to GitHub Pages via `.github/workflows/deploy.yml`. The site is served from `/awesome-subtitles/`; set the `VITE_BASE` env var at build time for a custom domain or user/org page.

> **How is this serverless?** All processing runs as WebAssembly / WebGPU in your browser; nothing is uploaded. ffmpeg runs single-threaded (no `SharedArrayBuffer` / cross-origin-isolation headers needed, which GitHub Pages can't set), so burn-in re-encoding is CPU-bound and slower than a desktop ffmpeg. Models and the ffmpeg core are fetched from CDNs (Hugging Face / unpkg) and cached locally on first use.

## Tech

Vite · React · TypeScript · [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) · [transformers.js](https://github.com/huggingface/transformers.js) (Whisper + image captioning).

See [CLAUDE.md](./CLAUDE.md) for architecture details.
