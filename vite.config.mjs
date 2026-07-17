import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { fileURLToPath, URL } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => {
  return {
    plugins: [react()],
    publicDir: false,
    build: {
      emptyOutDir: false,
      sourcemap: true,
      outDir: 'public',
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        input: resolve(__dirname, 'src/views/main.tsx'),
        output: {
          entryFileNames: 'app.js',
          chunkFileNames: '[name].js',
          assetFileNames: '[name].[ext]',
          dir: 'public',
          manualChunks: {
            react: ['react', 'react-dom', '@inertiajs/react'],
          },
        }
      }
    },
    mode: mode,
    resolve: {
      alias: {
        '@': resolve(__dirname, './src')
      }
    },
  }
})