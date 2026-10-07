import { describe, expect, it } from 'vitest';
import { fetchCandleSet } from '../../shared/candles';
import { CircuitBreaker } from '../../shared/failover';
import { buildSnapshot, REFRESH_MS, withLivePrices } from '../../shared/snapshot';
import { BINANCE_BASE } from '../../shared/sources/binance';
import { COINGECKO_BASE } from '../../shared/sources/coingecko';
import { emptySnapshot } from '../../shared/types';
import { healthyRoutes, klines } from '../helpers/data';
import { mockFetch } from '../helpers/mockFetch';

const NOW = 1_800_000_000_000;
const opts = { now: NOW, baseDelayMs: 0 };

describe('buildSnapshot', () => {
  it('fills every part from the primary sources', async () => {
    const { snapshot, refreshed, errors } = await buildSnapshot(emptySnapshot(), mockFetch(healthyRoutes()), new CircuitBreaker(), opts);
    expect(errors).toEqual([]);
    expect(refreshed.sort()).toEqual(['fearGreed', 'global', 'markets', 'trending']);
    expect(snapshot.markets).toMatchObject({ source: 'coingecko', asOf: NOW });
    expect(snapshot.fearGreed?.source).toBe('alternative.me');
  });

  it('falls back to CoinPaprika and keeps known sparklines and logos', async () => {
    const first = await buildSnapshot(emptySnapshot(), mockFetch(healthyRoutes()), new CircuitBreaker(), opts);
    const down = mockFetch(healthyRoutes({}, [COINGECKO_BASE]));
    const later = NOW + REFRESH_MS.trending;
    const { snapshot } = await buildSnapshot(first.snapshot, down, new CircuitBreaker(), { ...opts, now: later });
    expect(snapshot.markets?.source).toBe('coinpaprika');
    expect(snapshot.global?.source).toBe('coinpaprika');
    const btc = snapshot.markets!.data.find((a) => a.id === 'bitcoin')!;
    expect(btc.price).toBe(63900);
    expect(btc.sparkline).toHaveLength(42);
    expect(btc.image).toContain('coingecko');
    // Trending has no fallback, so the last good value is kept.
    expect(snapshot.trending?.asOf).toBe(NOW);
  });

  it('keeps the last good data when every source fails', async () => {
    const first = await buildSnapshot(emptySnapshot(), mockFetch(healthyRoutes()), new CircuitBreaker(), opts);
    const { snapshot, errors, refreshed } = await buildSnapshot(first.snapshot, mockFetch({}), new CircuitBreaker(), {
      ...opts,
      now: NOW + REFRESH_MS.trending,
    });
    expect(refreshed).toEqual([]);
    expect(errors.map((e) => e.part).sort()).toEqual(['fearGreed', 'global', 'markets', 'trending']);
    expect(snapshot).toEqual(first.snapshot);
  });

  it('only refreshes parts that are due', async () => {
    const first = await buildSnapshot(emptySnapshot(), mockFetch(healthyRoutes()), new CircuitBreaker(), opts);
    const f = mockFetch(healthyRoutes());
    const { refreshed } = await buildSnapshot(first.snapshot, f, new CircuitBreaker(), { ...opts, now: NOW + REFRESH_MS.markets });
    expect(refreshed).toEqual(['markets']);
    expect(f.calls).toHaveLength(1);
  });
});

describe('withLivePrices', () => {
  const asset = { id: 'bitcoin', symbol: 'BTC', price: 64000, change24h: 1 } as never;
  it('applies a matching live price', () => {
    const [a] = withLivePrices([asset], { prices: { BTC: { price: 64500, change24h: 2 } }, asOf: 0, source: 'binance' });
    expect(a).toMatchObject({ price: 64500, change24h: 2 });
  });
  it('ignores a live price for a different coin with the same ticker', () => {
    const [a] = withLivePrices([asset], { prices: { BTC: { price: 12, change24h: 50 } }, asOf: 0, source: 'binance' });
    expect(a).toMatchObject({ price: 64000, change24h: 1 });
  });
});

describe('fetchCandleSet', () => {
  it('uses Binance first', async () => {
    const set = await fetchCandleSet({ id: 'bitcoin', symbol: 'BTC', refPrice: 64000, range: '7d' }, mockFetch(healthyRoutes()), new CircuitBreaker(), opts);
    expect(set.source).toBe('binance');
  });

  it('rejects exchange candles for a different coin and falls back', async () => {
    const f = mockFetch(healthyRoutes({ [`${BINANCE_BASE}/klines`]: () => klines(5) }));
    const set = await fetchCandleSet({ id: 'bitcoin', symbol: 'BTC', refPrice: 64000, range: '7d' }, f, new CircuitBreaker(), opts);
    expect(set.source).toBe('coingecko');
  });

  it('goes straight to CoinGecko for stablecoins', async () => {
    const f = mockFetch(healthyRoutes());
    const set = await fetchCandleSet({ id: 'tether', symbol: 'USDT', refPrice: 1, range: '7d' }, f, new CircuitBreaker(), opts);
    expect(set.source).toBe('coingecko');
    expect(f.calls.some((u) => u.includes('binance'))).toBe(false);
  });

  it('uses Kraken when Binance and CoinGecko are down', async () => {
    const f = mockFetch(healthyRoutes({}, [BINANCE_BASE, COINGECKO_BASE]));
    const set = await fetchCandleSet({ id: 'bitcoin', symbol: 'BTC', refPrice: 64000, range: '7d' }, f, new CircuitBreaker(), opts);
    expect(set.source).toBe('kraken');
  });
});
