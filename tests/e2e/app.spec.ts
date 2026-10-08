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

test('about page renders', async ({ page }) => {
  await page.goto('/#/about');
  await expect(page.getByText('Not financial advice', { exact: false }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await axe(page);
});

test('signals screener lists, filters and explains ratings', async ({ page }) => {
  await page.goto('/#/signals');
  await expect(page.getByRole('heading', { name: 'Signals', level: 1 })).toBeVisible();
  const rows = page.locator('main ul a[href^="#/asset/"]');
  await expect(rows.first()).toBeVisible();
  const total = await rows.count();
  expect(total).toBeGreaterThan(40);
  await expect(page.getByRole('link', { name: /^Tether:/ })).toHaveCount(0); // stablecoins aren't rated
  await expectNoHorizontalScroll(page);
  await expectTapTargets(page);
  await axe(page);

  await page.getByRole('button', { name: 'Bearish', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bearish', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const bearish = await rows.count();
  expect(bearish).toBeGreaterThan(0);
  expect(bearish).toBeLessThan(total);
  for (const label of await rows.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))) {
    expect(label).toMatch(/bearish/i);
  }

  await page.getByRole('button', { name: 'How signals work' }).click();
  await expect(page.getByRole('dialog', { name: 'How signals work' })).toContainText('Long-term trend');
  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'How signals work' })).toBeHidden();
});

test('coin page shows its signal with plain-English reasons', async ({ page }) => {
  await page.goto('/#/asset/bitcoin');
  const card = page.getByRole('region', { name: 'Signals' });
  await expect(card).toBeVisible();
  await expect(card).toContainText(/Strong bullish signals|Leaning bullish|Mixed \/ neutral|Leaning bearish|Strong bearish signals/);
  await expect(card).toContainText('confidence');
  await expect(card.getByRole('img', { name: /^Score/ })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectTapTargets(page);

  await card.getByRole('button', { name: 'See all reasons' }).click();
  const why = page.getByRole('dialog', { name: 'Why this rating?' });
  await expect(why).toBeVisible();
  // The sheet must sit flush with the bottom of the screen (regression: hidden text once made it scroll up).
  await page.waitForTimeout(300);
  const gap = await page.evaluate(() => window.innerHeight - document.querySelector('dialog[open] .sheet-panel')!.getBoundingClientRect().bottom);
  expect(gap).toBeLessThan(1);
  for (const name of ['Long-term trend', '50/200-day averages', 'Momentum (MACD)', 'RSI (14 days)', 'Trading volume', 'Market mood']) {
    await expect(why).toContainText(name);
  }
  await expect(why).toContainText('not predictions or financial advice');
  await expect(why).not.toContainText(/\b(buy|sell)\b/i);
  await axe(page);
});

test('stablecoins say why they are not rated', async ({ page }) => {
  await page.goto('/#/asset/tether');
  await expect(page.getByText(/is a stablecoin/)).toBeVisible();
});

test('if the ratings service is down, coin pages still work out their own signal', async ({ page }) => {
  await page.unrouteAll();
  await mockApi(page, { signalsDown: true });
  await page.goto('/#/signals');
  await expect(page.getByRole('alert')).toContainText('Signals are unavailable right now', { timeout: 15_000 });
  await page.goto('/#/asset/ethereum');
  await expect(page.getByRole('button', { name: 'See all reasons' })).toBeVisible();
});

test('markets can be sorted by signal score', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Change sort/ }).click();
  await page.getByRole('radio', { name: 'Signal score' }).click();
  await expect(page.getByRole('heading', { name: 'Sorted by signal score' })).toBeVisible();
});

test('switching currency converts every price and is remembered', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /^Bitcoin, \$64,300/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /Change currency/ }).locator('visible=true').click();
  const sheet = page.getByRole('dialog', { name: 'Currency' });
  await expect(sheet).toBeVisible();
  await expectTapTargets(page);
  await axe(page);
  await sheet.getByRole('radio', { name: /EUR/ }).click();
  await expect(sheet).toBeHidden();

  // Mock rate: EUR 0.92 → 64,300 × 0.92 = 59,156
  await expect(page.getByRole('link', { name: /^Bitcoin, €59,156/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Market overview/ })).toContainText('€');
  await expectNoHorizontalScroll(page);

  await page.reload();
  await expect(page.getByRole('link', { name: /^Bitcoin, €59,156/ }).first()).toBeVisible();
  await page.goto('/#/asset/bitcoin');
  await expect(page.locator('main').getByText('€59,156').first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'Signals' })).toContainText('€');
});

test('yen prices have no decimals', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Change currency/ }).locator('visible=true').click();
  await page.getByRole('dialog', { name: 'Currency' }).getByRole('radio', { name: /JPY/ }).click();
  // XRP $0.5234 × 150 = ¥78.51 → ¥79 (no sen)
  await expect(page.getByRole('link', { name: /^XRP, ¥79,/ })).toBeVisible();
});

test('accessibility: watchlist, dark Signals and the install card', async ({ page }) => {
  await page.goto('/#/watchlist');
  await expect(page.getByText('Your watchlist is empty')).toBeVisible();
  await axe(page);
  await page.getByRole('button', { name: 'Add Bitcoin to watchlist' }).click();
  await axe(page);

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/#/signals');
  await expect(page.locator('main ul a').first()).toBeVisible();
  await axe(page);

  await page.goto('/#/about');
  await expect(page.getByRole('heading', { name: 'Add CryptoGuru to your home screen' })).toBeVisible();
  await axe(page);
});

test('backtest shows how often signals were right, against the any-day yardstick', async ({ page }) => {
  await page.goto('/#/signals');
  await page.getByRole('link', { name: 'How reliable are they?' }).click();
  await expect(page).toHaveURL(/#\/signals\/backtest$/);
  await expect(page.getByRole('heading', { name: 'How reliable are the signals?' })).toBeVisible();

  const yardstick = page.getByRole('region', { name: 'The yardstick: any day' });
  await expect(yardstick).toContainText(/higher 30 days later \d+%/, { timeout: 20_000 });
  const ratings = page.getByRole('region', { name: 'Overall ratings' }).getByRole('listitem');
  await expect(ratings).toHaveCount(5);
  await expect(page.getByRole('region', { name: 'Each indicator' }).getByRole('listitem')).toHaveCount(6);
  await expect(page.getByText(/\d+ coins · /)).toContainText('20 coins'); // the 20 largest after skipping Tether
  await expectNoHorizontalScroll(page);
  await expectTapTargets(page);
  await axe(page);

  await page.getByRole('button', { name: 'Next 7 days' }).click();
  await expect(yardstick).toContainText(/higher 7 days later \d+%/);
  // The signals tab stays highlighted while on the backtest page.
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Signals' })).toHaveAttribute('aria-current', 'page');
});

test('watchlist can be saved to a file and loaded back', async ({ page }) => {
  await page.goto('/#/asset/solana');
  await page.getByRole('button', { name: 'Add to watchlist' }).click();
  await page.goto('/#/watchlist');
  await page.getByRole('button', { name: 'Back up or move your watchlist' }).click();
  const sheet = page.getByRole('dialog', { name: 'Back up or move your watchlist' });
  await expectTapTargets(page);
  await axe(page);

  const [download] = await Promise.all([page.waitForEvent('download'), sheet.getByRole('button', { name: 'Save watchlist to a file' }).click()]);
  expect(download.suggestedFilename()).toBe('cryptoguru-watchlist.json');
  const saved = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()));
  expect(saved.watchlist).toEqual(['solana']);
  await expect(sheet.getByRole('status')).toContainText('Saved 1 coin');

  // Simulate a new phone: empty watchlist, then load the file.
  await page.evaluate(() => localStorage.removeItem('watchlist:v1'));
  await page.reload();
  await expect(page.getByText('Your watchlist is empty')).toBeVisible();
  await page.getByRole('button', { name: 'Load a saved file' }).click();
  await sheet.locator('input[type=file]').setInputFiles({
    name: 'cryptoguru-watchlist.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...saved, watchlist: ['solana', 'bitcoin', 'gone-coin'] })),
  });
  await expect(sheet.getByRole('status')).toContainText('Added 3 coins');
  await page.goBack();
  await expect(page.getByRole('link', { name: /^Solana,/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Bitcoin,/ })).toBeVisible();
  // A coin outside the top 100 is explained, not silently dropped.
  await expect(page.getByRole('status').filter({ hasText: 'gone-coin' })).toContainText('isn’t in today’s top 100');
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('gone-coin')).toHaveCount(0);
});

test('a bad watchlist file shows a clear error', async ({ page }) => {
  await page.goto('/#/watchlist');
  await page.getByRole('button', { name: 'Back up or move your watchlist' }).click();
  const sheet = page.getByRole('dialog', { name: 'Back up or move your watchlist' });
  await sheet.locator('input[type=file]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('nope') });
  await expect(sheet.getByRole('status')).toContainText('isn’t valid JSON');
});

test('sheet close buttons keep a full tap target when a long title wraps', async ({ page }) => {
  // Narrower than any phone project, so the long title has to wrap (font widths vary between machines).
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/#/watchlist');
  await page.getByRole('button', { name: 'Back up or move your watchlist' }).click();
  await expect(page.getByRole('dialog', { name: 'Back up or move your watchlist' })).toBeVisible();
  await expectTapTargets(page);
});
