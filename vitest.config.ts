import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    // node:test suites, run by `npm test -w @miloops-hq/core` (packages/core/test/run.mjs)
    exclude: ['**/node_modules/**', '**/*.node.test.ts'],
    testTimeout: 20_000,
  },
});
