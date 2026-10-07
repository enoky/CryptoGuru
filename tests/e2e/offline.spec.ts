import { expect, test } from '@playwright/test';
import { mockApi } from './mock';

// These tests need the real service worker.
test.use({ serviceWorkers: 'allow' });

test('opens with no connection after one visit, showing saved data', async ({ page, context }) => {
  await mockApi(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: /^Bitcoin, / }).first()).toBeVisible();
  // Wait until the service worker controls the page and has cached the app shell.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    }
  });
  expect(await page.evaluate(async () => (await caches.keys()).some((k) => k.startsWith('cryptoguru-shell-')))).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('link', { name: /^Bitcoin, / }).first()).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'You’re offline' })).toBeVisible();

  // A coin page whose chart was never opened still works, with the chart showing an error.
  await page.goto('/#/asset/solana');
  await expect(page.getByRole('heading', { name: 'Solana', level: 1 })).toBeVisible();
  await context.setOffline(false);
});

test('the manifest makes the app installable', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(href!)).json();
  expect(manifest.display).toBe('standalone');
  const sizes = manifest.icons.filter((i: { type: string }) => i.type === 'image/png').map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  expect((await request.get('/apple-touch-icon.png')).ok()).toBe(true);
});
