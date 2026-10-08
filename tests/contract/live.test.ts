/**
 * Live API contract check: calls each real API once and checks the response
 * still has the shape and sanity the app relies on. Runs nightly in GitHub
 * Actions (.github/workflows/contract.yml), not in normal test runs.
 *   npx vitest run --config vitest.contract.config.ts
 */
import { describe, expect, it } from 'vitest';
import * as binance from '../../shared/sources/binance';
import * as coingecko from '../../shared/sources/coingecko';
import * as coinpaprika from '../../shared/sources/coinpaprika';
import { fetchFearGreed, fetchFearGreedHistory } from '../../shared/sources/feargreed';
import * as kraken from '../../shared/sources/kraken';

const cg = { apiKey: process.env.COINGECKO_DEMO_KEY || undefined };

describe('CoinGecko', () => {
  it('markets: top 100 with prices', async () => {
    const assets = await coingecko.fetchMarkets(fetch, cg);
    expect(assets.length).toBeGreaterThanOrEqual(90);
    expect(assets.find((a) => a.id === 'bitcoin')?.price).toBeGreaterThan(0);
  });
  it('sparklines', async () => {
    const lines = await coingecko.fetchSparklines(fetch, cg);
    expect(Object.keys(lines).length).toBeGreaterThanOrEqual(80);
  });
  it('global stats and exchange rates', async () => {
    const g = await coingecko.fetchGlobal(fetch, cg);
    expect(g.totalMarketCap).toBeGreaterThan(1e11);
    expect(g.btcDominance).toBeGreaterThan(0);
    for (const code of ['EUR', 'GBP', 'JPY', 'INR', 'CAD', 'AUD', 'CHF']) expect(g.fx?.[code], code).toBeGreaterThan(0);
  });
  it('trending', async () => {
    expect((await coingecko.fetchTrending(fetch, cg)).length).toBeGreaterThanOrEqual(3);
  });
  it('chart for one coin', async () => {
    expect((await coingecko.fetchCandles(fetch, 'bitcoin', '7d', cg)).length).toBeGreaterThanOrEqual(100);
  });
});

describe('Binance', () => {
  it('24h tickers', async () => {
    expect((await binance.fetchTickers(fetch)).BTC?.price).toBeGreaterThan(0);
  });
  it('1000 daily candles (backtest history)', async () => {
    expect((await binance.fetchCandles(fetch, 'BTC', '1y', { days: 1000 })).length).toBeGreaterThanOrEqual(900);
  });
});

describe('Kraken', () => {
  it('daily candles', async () => {
    expect((await kraken.fetchCandles(fetch, 'BTC', '1y')).length).toBeGreaterThanOrEqual(300);
  });
});

describe('CoinPaprika', () => {
  it('tickers', async () => {
    const assets = await coinpaprika.fetchMarkets(fetch);
    expect(assets.length).toBeGreaterThanOrEqual(90);
    expect(assets.find((a) => a.id === 'bitcoin')).toBeDefined();
  });
  it('global stats', async () => {
    expect((await coinpaprika.fetchGlobal(fetch)).totalMarketCap).toBeGreaterThan(1e11);
  });
});

describe('Alternative.me', () => {
  it('Fear & Greed today', async () => {
    const fg = await fetchFearGreed(fetch);
    expect(fg.value).toBeGreaterThanOrEqual(0);
    expect(fg.history.length).toBeGreaterThanOrEqual(7);
  });
  it('Fear & Greed history', async () => {
    expect((await fetchFearGreedHistory(fetch)).length).toBeGreaterThanOrEqual(2000);
  });
});
