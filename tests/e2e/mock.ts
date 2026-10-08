import type { Page } from '@playwright/test';
import { createMockApi, type MockOptions } from '../fixtures/mockData';

export { makeCandles, makeHistory, makeSignals, makeSnapshot } from '../fixtures/mockData';

/**
 * Serve /api from mock data and block every other host, so tests never
 * touch real APIs. Pass `apiDown` to simulate the Worker being unreachable.
 */
export async function mockApi(page: Page, opts: MockOptions = {}) {
  const answer = createMockApi(opts);
  await page.route(
    (url) => url.hostname !== 'localhost',
    (route) => route.abort(),
  );
  await page.route('**/api/**', (route) => {
    const { status, body } = answer(new URL(route.request().url()));
    return route.fulfill({ status, json: body });
  });
}
