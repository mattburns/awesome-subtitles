import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves project sites from /<repo>/. Override with VITE_BASE
// (e.g. "/" for a user/org page or a custom domain).
const base = process.env.VITE_BASE ?? '/awesome-subtitles/'

export default defineConfig({
  base,
  plugins: [react()],
  worker: { format: 'es' },
  optimizeDeps: {
    // ffmpeg.wasm ships its own worker + wasm; let it load at runtime.
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})
