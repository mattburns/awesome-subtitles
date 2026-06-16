import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves project sites from /<repo>/. Override with VITE_BASE
// (e.g. "/" for a user/org page or a custom domain).
const base = process.env.VITE_BASE ?? '/awesome-subtitles/'

// COOP/COEP are required for SharedArrayBuffer, which multi-threaded
// ffmpeg.wasm needs. In dev we set the headers directly; in production on
// GitHub Pages (which can't set headers) coi-serviceworker injects them.
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  base,
  plugins: [react()],
  server: { headers: crossOriginIsolationHeaders },
  preview: { headers: crossOriginIsolationHeaders },
  worker: { format: 'es' },
  optimizeDeps: {
    // ffmpeg.wasm ships its own worker + wasm; let it load at runtime.
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})
