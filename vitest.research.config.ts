import { defineConfig } from 'vitest/config';

/** The all-coins backtest only (see tests/research/full.test.ts). Calls live APIs. */
export default defineConfig({
  test: {
    include: ['tests/research/**/*.test.ts'],
    testTimeout: 600_000,
  },
});
