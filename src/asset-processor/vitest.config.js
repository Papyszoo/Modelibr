import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary'],
    },
    reporters: ['default', 'json'],
    outputFile: {
      json: 'test-results/results.json',
    },
  },
})
