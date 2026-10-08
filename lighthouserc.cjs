// Lighthouse CI: mobile profile (emulated mid-range phone, throttled 4G) against
// the built app with mock data, so scores don't depend on live APIs.
// Run: npm run build && npx lhci autorun
const { chromium } = require('@playwright/test');

const PORT = 4174;
const base = `http://localhost:${PORT}`;

module.exports = {
  ci: {
    collect: {
      startServerCommand: `MOCK_API=1 npx vite preview --port ${PORT} --strictPort`,
      startServerReadyPattern: 'Local',
      // The query strings only keep the three screens apart in the report (LHCI ignores what follows #).
      url: [`${base}/?screen=markets`, `${base}/?screen=coin#/asset/bitcoin`, `${base}/?screen=signals#/signals`],
      numberOfRuns: 3,
      chromePath: process.env.CHROME_PATH || chromium.executablePath(),
      settings: { chromeFlags: '--no-sandbox --headless=new' },
    },
    // Targets from PLAN.md §7. Each is checked against the median of the runs.
    assert: {
      // Judge the typical (median) run, not the best one.
      aggregationMethod: 'median-run',
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:seo': ['error', { minScore: 0.9 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2000 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.05 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
        // Initial JavaScript, compressed: 120 KB budget.
        'resource-summary:script:size': ['error', { maxNumericValue: 120 * 1024 }],
      },
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
};
