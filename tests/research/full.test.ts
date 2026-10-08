/**
 * Backtest across every coin in the current top 100 (stablecoins excluded),
 * comparing the live rules with the pre-Phase-4 rules and two baselines.
 * Calls the real APIs, so it runs in GitHub Actions (.github/workflows/backtest.yml),
 * not in normal test runs:
 *   npx vitest run --config vitest.research.config.ts
 * Writes the report to BACKTEST_REPORT (default backtest-report.md).
 */
import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { completedDays, dayKey, marketHistory, readings } from '../../shared/backtest';
import { fetchCandleSet } from '../../shared/candles';
import { CircuitBreaker } from '../../shared/failover';
import { isStablecoin } from '../../shared/signals';
import * as coingecko from '../../shared/sources/coingecko';
import { fetchFearGreedHistory } from '../../shared/sources/feargreed';
import type { Asset, Candle } from '../../shared/types';
import { compare, toMarkdown } from './compare';

const DAYS = 1000;

async function history(a: Asset, now: number): Promise<Candle[] | null> {
  try {
    const set = await fetchCandleSet({ id: a.id, symbol: a.symbol, refPrice: a.price, range: '1y', days: DAYS }, fetch, new CircuitBreaker(), {
      now,
      order: 'exchanges-first',
      allowCoinGecko: false,
    });
    return completedDays(set.candles, now);
  } catch {
    return null;
  }
}

it('backtests every rated coin', async () => {
  const now = Date.now();
  const assets = (await coingecko.fetchMarkets(fetch, { apiKey: process.env.COINGECKO_DEMO_KEY || undefined })).filter((a) => !isStablecoin(a.symbol));
  const fearGreed = new Map((await fetchFearGreedHistory(fetch)).map((r) => [dayKey(r.t), r.value]));

  // A few downloads at a time, to stay well inside the exchanges' rate limits.
  const got: ({ id: string; candles: Candle[] } | null)[] = new Array(assets.length).fill(null);
  let next = 0;
  const lane = async () => {
    while (next < assets.length) {
      const i = next++;
      const candles = await history(assets[i], now);
      if (candles) got[i] = { id: assets[i].id, candles };
    }
  };
  await Promise.all([lane(), lane(), lane()]);

  const coins = got.filter((c): c is { id: string; candles: Candle[] } => !!c);
  const market = marketHistory(coins);
  const byCoin = coins.map((c) => ({ id: c.id, readings: readings(c.id, c.candles, market, fearGreed) }));
  const tested = new Set(byCoin.filter((c) => c.readings.length).map((c) => c.id));
  const missing = assets.filter((a) => !tested.has(a.id)).map((a) => a.name);

  const report = toMarkdown(compare(byCoin, missing), now);
  writeFileSync(process.env.BACKTEST_REPORT || 'backtest-report.md', report);
  console.log(report);
  expect(tested.size).toBeGreaterThanOrEqual(30);
}, 600_000);
