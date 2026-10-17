import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// /api/* -> FastAPI on :8000, so the server's CORS (CLIENT_URL) doesn't need to know about this port.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8000', rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
})
