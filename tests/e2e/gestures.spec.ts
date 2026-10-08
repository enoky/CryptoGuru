import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './mock';

// Real touch input through Chrome DevTools, on the phone-sized projects only.
test.skip(({ hasTouch }) => !hasTouch, 'touch gestures need a touch screen');

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  const cdp = await page.context().newCDPSession(page);
  const point = (t: number) => [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(0) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(i / steps) });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('pulling down at the top of Markets refreshes it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /^Bitcoin, / }).first()).toBeVisible();
  let snapshots = 0;
  page.on('request', (r) => r.url().includes('/api/snapshot') && snapshots++);

  // A short pull is ignored.
  await drag(page, { x: 200, y: 250 }, { x: 200, y: 300 });
  await page.waitForTimeout(300);
  expect(snapshots).toBe(0);

  // A full pull refreshes.
  await drag(page, { x: 200, y: 250 }, { x: 200, y: 450 });
  await expect.poll(() => snapshots).toBeGreaterThan(0);
  await expect(page.getByTestId('pull-indicator')).toBeHidden();
});

test('pulling only works from the top of the page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /^Bitcoin, / }).first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 600));
  let snapshots = 0;
  page.on('request', (r) => r.url().includes('/api/snapshot') && snapshots++);
  await drag(page, { x: 200, y: 250 }, { x: 200, y: 450 });
  await page.waitForTimeout(400);
  expect(snapshots).toBe(0);
});

test('swiping a watchlist row left removes it, with undo', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('watchlist:v1', JSON.stringify(['bitcoin', 'ethereum', 'solana'])));
  await page.goto('/#/watchlist');
  const solana = page.getByRole('link', { name: /^Solana, / });
  await expect(solana).toBeVisible();
  const box = (await solana.boundingBox())!;
  const y = box.y + box.height / 2;

  // Long swipe: removed straight away, without opening the coin.
  await drag(page, { x: box.x + box.width - 20, y }, { x: box.x + 10, y });
  await expect(solana).toHaveCount(0);
  await expect(page).toHaveURL(/#\/watchlist$/);
  await page.getByRole('status').filter({ hasText: 'Removed Solana' }).getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('link', { name: /^Solana, / })).toBeVisible();
  // Back in its old place: third.
  await expect(page.locator('main ul a[href^="#/asset/"]').nth(2)).toHaveAttribute('href', '#/asset/solana');

  // Short swipe: reveals a Remove button.
  const eth = page.getByRole('link', { name: /^Ethereum, / });
  const ebox = (await eth.boundingBox())!;
  await drag(page, { x: ebox.x + ebox.width - 20, y: ebox.y + ebox.height / 2 }, { x: ebox.x + ebox.width - 90, y: ebox.y + ebox.height / 2 });
  const reveal = page.locator('li', { has: eth }).getByText('Remove', { exact: true });
  await expect(reveal).toBeInViewport();
  await reveal.click();
  await expect(eth).toHaveCount(0);
});

test('a vertical scroll over a row never removes it', async ({ page }) => {
  await page.goto('/#/watchlist');
  await page.getByRole('button', { name: 'Add Bitcoin to watchlist' }).click();
  const btc = page.getByRole('link', { name: /^Bitcoin, / });
  const box = (await btc.boundingBox())!;
  await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, { x: box.x + box.width / 2 - 30, y: box.y + box.height / 2 + 120 });
  await page.waitForTimeout(300);
  await expect(btc).toBeVisible();
});
