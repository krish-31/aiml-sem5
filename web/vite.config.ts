import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev: `npm run dev` proxies /api to the FastAPI server on :8000.
// Build: `npm run build` writes web/dist, which FastAPI serves at /.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: { fs: { allow: ['..'] }, proxy: { '/api': 'http://127.0.0.1:8000' } },
  css: { postcss: {} },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 700 },
})
