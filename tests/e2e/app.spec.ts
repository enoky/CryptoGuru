import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './mock';

/** The page must never scroll sideways. */
async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

/** Buttons and nav links must be at least 44 × 44 px (inline text links are exempt). */
async function expectTapTargets(page: Page) {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, nav a, [role="radio"], input')]
      .filter((el) => el.offsetParent !== null && !el.classList.contains('sr-only') && !el.closest('dialog:not([open])'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.width < 43.5 || r.height < 43.5))
      .map(({ el, r }) => `${el.tagName} "${el.getAttribute('aria-label') ?? el.textContent?.trim()}" ${r.width}×${r.height}`),
  );
  expect(small).toEqual([]);
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('markets list fits the screen and is easy to tap', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /^Bitcoin, \$64,300, up/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Market overview/ })).toContainText('$2.41T');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Markets' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('main li a[href^="#/asset/"]')).toHaveCount(50 + 6); // 50 rows + trending cards
  await expect(page.getByText(/Prices as of/)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTapTargets(page);
  await axe(page);
});

test('long names and tiny prices fit without breaking the layout', async ({ page }) => {
  await page.goto('/');
  const row = page.getByRole('link', { name: /^Wrapped Bitcoin With A Very Long Name, / });
  await expect(row).toBeVisible();
  const box = (await row.boundingBox())!;
  expect(box.height).toBeLessThan(90);
  await expect(page.getByRole('link', { name: /^Shiba Inu, / })).toContainText('$0.00001834');
  await expectNoHorizontalScroll(page);
});

test('search filters the list and can be cleared', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Search coins' }).fill('sol');
  await expect(page.locator('main li a[href^="#/asset/"]')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search coins' }).fill('zzzz');
  await expect(page.getByText('No coins match “zzzz”.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.locator('main li a[href^="#/asset/"]').first()).toBeVisible();
});

test('sort opens as a sheet that the back button closes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Change sort/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Sort by' });
  await expect(sheet).toBeVisible();
  await expectTapTargets(page);
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/(#\/)?$/);

  await page.getByRole('button', { name: /Change sort/ }).click();
  await sheet.getByRole('radio', { name: '24h change' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Sorted by 24h change' })).toBeVisible();
});

test('asset page shows chart, ranges and stats', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /^Bitcoin,/ }).first().click();
  await expect(page).toHaveURL(/#\/asset\/bitcoin$/);
  await expect(page.getByRole('heading', { name: 'Bitcoin', level: 1 })).toBeVisible();
  await expect(page.locator('section[aria-label="Price chart"] canvas').first()).toBeVisible();
  await page.getByRole('button', { name: '1y' }).click();
  await expect(page.getByRole('button', { name: '1y' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('1 year')).toBeVisible();
  await expect(page.getByText('Volatility', { exact: true })).toBeVisible();
  await expect(page.getByText(/% · 30 days|Low · 30 days|Medium · 30 days|High · 30 days/)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTapTargets(page);
  await axe(page);

  await page.getByRole('button', { name: 'What is Market cap?' }).click();
  await expect(page.getByRole('dialog', { name: 'Market cap' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog', { name: 'Market cap' })).toBeHidden();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/(#\/)?$/);
});

test('watchlist is saved on the device', async ({ page }) => {
  await page.goto('/#/asset/ethereum');
  await page.getByRole('button', { name: 'Add to watchlist' }).click();
  await expect(page.getByRole('button', { name: /In your watchlist/ })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Watchlist' }).click();
  await expect(page.getByRole('link', { name: /^Ethereum,/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: /^Ethereum,/ })).toBeVisible();

  await page.getByRole('button', { name: 'Edit' }).click();
  await expectTapTargets(page);
  await page.getByRole('button', { name: 'Remove Ethereum' }).click();
  await expect(page.getByText('Your watchlist is empty')).toBeVisible();
  await page.getByRole('button', { name: 'Add Bitcoin to watchlist' }).click();
  await expect(page.getByRole('link', { name: /^Bitcoin,/ })).toBeVisible();
});

test('theme toggle switches between light and dark', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: /^Theme/ }).locator('visible=true');
  await toggle.click();
  const t = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(['light', 'dark']).toContain(t);
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(t);
  await axe(page);
});

test('when the API is down, saved data still shows with a warning', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /^Bitcoin,/ }).first()).toBeVisible();
  await page.waitForTimeout(300); // let IndexedDB save

  await page.unrouteAll();
  await mockApi(page, { apiDown: true });
  await page.reload();
  await expect(page.getByRole('link', { name: /^Bitcoin,/ }).first()).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Couldn’t refresh', { timeout: 15_000 });
  await expectNoHorizontalScroll(page);
});

test('with no API and nothing saved, a clear error offers a retry', async ({ page }) => {
  await page.unrouteAll();
  await mockApi(page, { apiDown: true });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('couldn’t load market data', { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('other tabs render', async ({ page }) => {
  await page.goto('/#/signals');
  await expect(page.getByRole('heading', { name: 'Signals' })).toBeVisible();
  await page.goto('/#/about');
  await expect(page.getByText('Not financial advice', { exact: false }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await axe(page);
});
