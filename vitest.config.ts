import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve('src/shared') }
  },
  test: {
    include: ['tests/**/*.test.ts'],
    // Test integrasi menjalankan Electron sungguhan; beri waktu untuk startup.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Satu proses Electron pada satu waktu — masing-masing memegang lock instance.
    fileParallelism: false
  }
})
