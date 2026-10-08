import { defineConfig, devices } from '@playwright/test';

/** Phones first: the app is designed for a 360–430 px screen used one-handed. */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // Service workers are off except in offline.spec.ts, so mocked API routes always apply.
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure', serviceWorkers: 'block' },
  // MOCK_API=1: any /api request a test doesn't intercept still gets mock data instead of a connection error.
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: !process.env.CI, env: { MOCK_API: '1' } },
  projects: [
    { name: 'small-phone-360', use: { ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 }, browserName: 'chromium' } },
    { name: 'iphone-se-375', use: { ...devices['iPhone SE'], viewport: { width: 375, height: 667 }, browserName: 'chromium' } },
    { name: 'pixel-7-412', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
});
