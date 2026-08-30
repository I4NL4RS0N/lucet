import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The a11y audit drives a real browser and runs as its own step, so it is
    // deliberately not picked up here.
    include: ['packages/*/src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    environment: 'node',
  },
})
