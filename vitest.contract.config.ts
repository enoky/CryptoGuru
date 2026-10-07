import { defineConfig } from 'vitest/config';

/** Live API checks only (see tests/contract/live.test.ts). Retries absorb one-off network blips. */
export default defineConfig({
  test: {
    include: ['tests/contract/**/*.test.ts'],
    testTimeout: 60_000,
    retry: 2,
    fileParallelism: false,
  },
});
