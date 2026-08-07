import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // The Go engine runs in a separate long-lived process (see server/), so in
    // dev we proxy /api to it. In production the two are deployed apart and
    // VITE_API_BASE points at the backend instead.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
