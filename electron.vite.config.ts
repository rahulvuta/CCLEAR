import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/main.ts')
      }
    }
  },
  preload: {
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/preload.ts'),
        /** Sandbox preloads must be CJS; ESM (.mjs) fails with "Cannot use import statement outside a module". */
        formats: ['cjs'],
        fileName: () => 'preload.js'
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@focus': resolve(__dirname, 'src/focus')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html')
      }
    }
  }
})
