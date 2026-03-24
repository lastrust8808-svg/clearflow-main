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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/')

          if (normalized.includes('node_modules')) {
            if (
              normalized.includes('/react/') ||
              normalized.includes('/react-dom/') ||
              normalized.includes('/scheduler/')
            ) {
              return 'vendor-react'
            }

            if (
              normalized.includes('/react-plaid-link/') ||
              normalized.includes('/plaid/')
            ) {
              return 'vendor-banking'
            }

            if (
              normalized.includes('/@google/genai/') ||
              normalized.includes('/rxjs/') ||
              normalized.includes('/zustand/')
            ) {
              return 'vendor-platform'
            }

            return 'vendor-misc'
          }
        },
      },
    },
  },
})
