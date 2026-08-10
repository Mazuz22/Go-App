import { defineConfig } from 'vitest/config'

// The server has its own test suite (server/games.test.js, run via
// `node --test` — see server/package.json) using Node's built-in test
// runner, not Vitest. Excluded here so Vitest's default *.test.js glob
// doesn't try to parse node:test syntax and fail the run.
export default defineConfig({
  test: {
    exclude: ['server/**', 'node_modules/**'],
  },
})
