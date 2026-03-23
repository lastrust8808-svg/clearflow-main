import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 3001,
    strictPort: true,
    hmr: false,
    watch: {
      ignored: ['**/dist/**', '**/server/storage-data/**', '**/.git/**'],
    },
  },
})
