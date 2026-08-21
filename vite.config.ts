import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dataApiPlugin } from './server/data-api-plugin'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), dataApiPlugin(root)],
  resolve: {
    alias: {
      '@': path.join(root, 'src'),
      '@shared': path.join(root, 'shared'),
    },
  },
  server: {
    port: 5273,
    strictPort: false,
    open: false,
  },
  preview: {
    port: 5274,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          editor: [
            '@uiw/react-codemirror',
            '@codemirror/lang-markdown',
            '@codemirror/view',
            '@codemirror/state',
            '@codemirror/commands',
            '@codemirror/autocomplete',
          ],
          markdown: ['react-markdown', 'remark-gfm'],
          motion: ['framer-motion'],
        },
      },
    },
  },
})
