import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@shared': resolve(root, 'src/shared'),
      '@focus': resolve(root, 'src/focus')
    }
  }
})
