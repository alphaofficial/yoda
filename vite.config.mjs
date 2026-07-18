import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { fileURLToPath, URL } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => {
  return {
    plugins: [react(), tailwindcss()],
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
          assetFileNames: assetInfo => {
            const sourceName = assetInfo.names?.[0] ?? ''
            return /\.(woff2?|ttf|otf|eot)$/i.test(sourceName)
              ? 'fonts/[name].[ext]'
              : '[name].[ext]'
          },
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
