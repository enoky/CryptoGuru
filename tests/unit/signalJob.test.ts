import { describe, expect, it } from 'vitest';
import { budgetedFetch } from '../../shared/budget';
import { CircuitBreaker } from '../../shared/failover';
import type { SignalsDoc } from '../../shared/signals';
import { BINANCE_BASE } from '../../shared/sources/binance';
import { COINGECKO_BASE } from '../../shared/sources/coingecko';
import { KRAKEN_BASE } from '../../shared/sources/kraken';
import type { Asset, Snapshot } from '../../shared/types';
import { BATCH, COINGECKO_REFRESH_MS, PEGGED_RECHECK_MS, refreshSignals, SIGNAL_DAYS, SIGNAL_REFRESH_MS } from '../../worker/signals';
import { cgChart, healthyRoutes, wobble } from '../helpers/data';
import { mockFetch } from '../helpers/mockFetch';

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

/** 365 daily klines ending at `price`, newest today. */
const dailyKlines = (price: number) =>
  Array.from({ length: 365 }, (_, i) => {
    const p = price * (0.7 + (0.3 * i) / 364 + wobble(i, 365));
    return [NOW - (364 - i) * DAY - DAY / 2, String(p), String(p), String(p), String(p), '100', 0];
  });

/** A tokenised fund: 365 days at about $1.08. */
const flatKlines = (price: number) =>
  Array.from({ length: 365 }, (_, i) => {
    const p = String(price * (1 + (i % 2) / 10_000));
    return [NOW - (364 - i) * DAY - DAY / 2, p, p, p, p, '100', 0];
  });

const asset = (id: string, symbol: string, price: number): Asset => ({ id, symbol, name: id, price, rank: 1 }) as Asset;

const snapshot = (assets: Asset[]): Snapshot => ({
  markets: { data: assets, asOf: NOW, source: 'coingecko' },
  global: null,
  trending: null,
  fearGreed: { data: { value: 50, label: 'Neutral', history: [] }, asOf: NOW, source: 'alternative.me' },
});

const routes = (over = {}) =>
  healthyRoutes({
    [`${BINANCE_BASE}/klines`]: (url: string) =>
      url.includes('symbol=NOPAIR') ? 400 : url.includes('symbol=FUND') ? flatKlines(1.08) : dailyKlines(url.includes('symbol=ETH') ? 3000 : 100),
    [`${KRAKEN_BASE}/OHLC`]: () => ({ error: ['EQuery:Unknown asset pair'] }),
    [`${COINGECKO_BASE}/coins/`]: () => cgChart(50, 365),
    ...over,
  });

const run = (prev: SignalsDoc | null, assets: Asset[], f = mockFetch(routes()), budget = 45, now = NOW, batch?: number) => {
  const fetchFn = budgetedFetch(f, budget);
  return refreshSignals(prev, snapshot(assets), fetchFn, new CircuitBreaker(), { now, baseDelayMs: 0, batch }).then((r) => ({ ...r, calls: f.calls }));
};

describe('refreshSignals', () => {
  it('rates coins and skips stablecoins', async () => {
    const r = await run(null, [asset('bitcoin', 'BTC', 100), asset('ethereum', 'ETH', 3000), asset('tether', 'USDT', 1)]);
    expect(r.rated.sort()).toEqual(['bitcoin', 'ethereum']);
    expect(r.doc.items.bitcoin.source).toBe('binance');
    expect(r.calls.find((u) => u.includes('klines'))).toContain(`limit=${SIGNAL_DAYS}`);
    expect(r.doc.items.tether).toBeUndefined();
    expect(r.calls.some((u) => u.includes('symbol=USDTUSDT'))).toBe(false);
  });

  it('works through a batch at a time, stalest first', async () => {
    const assets = Array.from({ length: 12 }, (_, i) => asset(`c${i}`, `C${i}`, 100));
    const first = await run(null, assets);
    expect(first.rated).toHaveLength(BATCH);
    const second = await run(first.doc, assets, undefined, 45, NOW + 10 * 60_000);
    expect(second.rated.sort()).toEqual(['c10', 'c11', 'c8', 'c9']);
  });

  it('re-rates a coin only once its rating is an hour old', async () => {
    const assets = [asset('bitcoin', 'BTC', 100)];
    const first = await run(null, assets);
    expect((await run(first.doc, assets, undefined, 45, NOW + 30 * 60_000)).rated).toEqual([]);
    expect((await run(first.doc, assets, undefined, 45, NOW + SIGNAL_REFRESH_MS)).rated).toEqual(['bitcoin']);
  });

  it('stops before the request budget runs out', async () => {
    const assets = Array.from({ length: 16 }, (_, i) => asset(`c${i}`, `C${i}`, 100));
    const r = await run(null, assets, undefined, 8, NOW, 16);
    expect(r.rated.length).toBe(6); // stops once fewer than 3 requests are left
    expect(r.calls.length).toBe(6);
  });

  it('uses CoinGecko for coins not on the exchanges, but only twice a day', async () => {
    const assets = [asset('leo', 'NOPAIR', 50)];
    const first = await run(null, assets);
    expect(first.doc.items.leo.source).toBe('coingecko');
    // A refresh period later: due again, but CoinGecko isn't allowed yet, so the old rating is kept.
    const later = await run(first.doc, assets, undefined, 45, NOW + SIGNAL_REFRESH_MS);
    expect(later.rated).toEqual([]);
    expect(later.doc.items.leo.asOf).toBe(NOW);
    expect(later.calls.some((u) => u.startsWith(COINGECKO_BASE))).toBe(false);
    const halfDay = await run(later.doc, assets, undefined, 45, NOW + COINGECKO_REFRESH_MS);
    expect(halfDay.rated).toEqual(['leo']);
  });

  it('rates Bitcoin first and measures the other coins against it in the same run', async () => {
    const r = await run(null, [asset('ethereum', 'ETH', 3000), asset('bitcoin', 'BTC', 100)]);
    expect(r.rated).toEqual(['bitcoin', 'ethereum']);
    const btc = r.doc.items.bitcoin.metrics.return90d!;
    expect(btc).toBeGreaterThan(0);
    expect(r.doc.items.bitcoin.signals.strength).toBeNull();
    expect(r.doc.items.ethereum.metrics.btcReturn90d).toBe(btc);
    expect(r.doc.items.ethereum.signals.strength).toBe(0); // same shape of chart: neither leads
    expect(r.doc.market).toEqual({ btcReturn90d: btc, breadth: null, breadthCoins: 2 });
  });

  it('passes each coin’s liquidity and distance from its all-time high', async () => {
    const a = { ...asset('ethereum', 'ETH', 3000), volume24h: 5e8, marketCap: 1e11, athChangePct: -40 };
    const r = await run(null, [a]);
    expect(r.doc.items.ethereum.metrics.turnover).toBe(0.5);
    expect(r.doc.items.ethereum.metrics.athChangePct).toBe(-40);
    expect(r.doc.items.ethereum.cautions).toContain('thin');
  });

  it('starts again from scratch when the stored ratings are in an older format', async () => {
    const old = { asOf: NOW - 60_000, items: { bitcoin: { id: 'bitcoin', asOf: NOW - 60_000 } }, skipped: {} } as unknown as SignalsDoc;
    const r = await run(old, [asset('bitcoin', 'BTC', 100)]);
    expect(r.rated).toEqual(['bitcoin']);
    expect(r.doc.version).toBe(2);
    expect(r.doc.items.bitcoin.trendParts).toBeDefined();
  });

  it('doesn’t rate gold tokens or stablecoins missing from the list, and finds pegged prices by how little they move', async () => {
    const r = await run(null, [asset('pax-gold', 'PAXG', 2400), asset('fund', 'FUND', 1.08), asset('bitcoin', 'BTC', 100)]);
    expect(r.rated).toEqual(['bitcoin']);
    expect(r.calls.some((u) => u.includes('symbol=PAXG'))).toBe(false);
    expect(r.doc.pegged).toEqual({ fund: NOW });
    expect(r.doc.items.fund).toBeUndefined();
    expect(r.doc.skipped.fund).toBeUndefined();
  });

  it('checks a pegged coin again only once a day, and rates it if its price starts moving', async () => {
    const assets = [asset('fund', 'FUND', 1.08)];
    const first = await run(null, assets);
    const later = await run(first.doc, assets, undefined, 45, NOW + SIGNAL_REFRESH_MS);
    expect(later.calls.some((u) => u.includes('symbol=FUND'))).toBe(false);
    // A day later its price moves like a coin's.
    const moving = mockFetch(routes({ [`${BINANCE_BASE}/klines`]: () => dailyKlines(1.08) }));
    const nextDay = await run(later.doc, assets, moving, 45, NOW + PEGGED_RECHECK_MS);
    expect(nextDay.rated).toEqual(['fund']);
    expect(nextDay.doc.pegged).toEqual({});
  });

  it('drops coins that left the top 100', async () => {
    const first = await run(null, [asset('bitcoin', 'BTC', 100), asset('ethereum', 'ETH', 3000)]);
    const r = await run(first.doc, [asset('bitcoin', 'BTC', 100)], undefined, 45, NOW + 60_000);
    expect(Object.keys(r.doc.items)).toEqual(['bitcoin']);
    expect(r.changed).toBe(true);
  });
});
