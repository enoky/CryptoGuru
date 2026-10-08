/**
 * Backtest across every coin in the current top 100 (pegged assets excluded),
 * on all the daily history Binance has (back to 2017), comparing the live
 * rules with the pre-Phase-4 rules, simple baselines and Phase 5 candidates.
 * Calls the real APIs, so it runs in GitHub Actions (.github/workflows/backtest.yml),
 * not in normal test runs:
 *   npx vitest run --config vitest.research.config.ts
 * Writes the report to BACKTEST_REPORT (default backtest-report.md).
 */
import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { completedDays, dayKey, marketHistory, readings } from '../../shared/backtest';
import { hasPeggedPrice, isPeggedSymbol } from '../../shared/signals';
import * as coingecko from '../../shared/sources/coingecko';
import { fetchFearGreedHistory } from '../../shared/sources/feargreed';
import type { Candle } from '../../shared/types';
import { addGroupHits, compare, toMarkdown } from './compare';
import { fullHistory } from './history';

it('backtests every rated coin', async () => {
  const now = Date.now();
  const assets = (await coingecko.fetchMarkets(fetch, { apiKey: process.env.COINGECKO_DEMO_KEY || undefined })).filter((a) => !isPeggedSymbol(a.symbol));
  const fearGreed = new Map((await fetchFearGreedHistory(fetch)).map((r) => [dayKey(r.t), r.value]));

  // A few downloads at a time, to stay well inside Binance's rate limits.
  const got: ({ id: string; candles: Candle[] } | null)[] = new Array(assets.length).fill(null);
  let next = 0;
  const lane = async () => {
    while (next < assets.length) {
      const i = next++;
      const a = assets[i];
      const candles = await fullHistory(fetch, a.symbol, a.price, now).catch(() => null);
      if (candles) got[i] = { id: a.id, candles: completedDays(candles, now) };
    }
  };
  await Promise.all([lane(), lane(), lane()]);

  const downloaded = got.filter((c): c is { id: string; candles: Candle[] } => !!c);
  // Like the live job: a price that barely moves is pegged, and isn't rated.
  const coins = downloaded.filter((c) => !hasPeggedPrice(c.candles));
  const peggedIds = new Set(downloaded.filter((c) => hasPeggedPrice(c.candles)).map((c) => c.id));
  const pegged = assets.filter((a) => peggedIds.has(a.id)).map((a) => a.name);
  const market = marketHistory(coins);
  const inputs = coins.map((c) => ({ id: c.id, candles: c.candles, readings: readings(c.id, c.candles, market, fearGreed) }));
  const tested = new Set(inputs.filter((c) => c.readings.length).map((c) => c.id));
  const missing = assets.filter((a) => !tested.has(a.id) && !peggedIds.has(a.id)).map((a) => a.name);

  const result = addGroupHits(compare(inputs, missing, pegged), inputs);
  const report = toMarkdown(result, now);
  writeFileSync(process.env.BACKTEST_REPORT || 'backtest-report.md', report);
  console.log(report);
  expect(tested.size).toBeGreaterThanOrEqual(30);
}, 900_000);
