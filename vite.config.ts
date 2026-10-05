import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  // Only these prefixes reach the browser bundle. NEXT_PUBLIC_* is what the Vercel <-> Supabase integration creates.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_SUPABASE_'],
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Stable vendor chunks: app code changes often, these rarely do, so browsers keep them cached across deploys.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id)) return 'vendor-react'
          if (id.includes('@supabase')) return 'vendor-supabase'
          if (id.includes('@tanstack')) return 'vendor-query'
          return undefined
        },
      },
    },
  },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
})
