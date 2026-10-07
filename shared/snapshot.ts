import { CircuitBreaker, firstSuccessful, type Attempt } from './failover';
import type { FetchFn } from './http';
import * as binance from './sources/binance';
import * as coingecko from './sources/coingecko';
import * as coinpaprika from './sources/coinpaprika';
import { fetchFearGreed } from './sources/feargreed';
import type { Asset, Part, PriceMap, Snapshot, SourceName } from './types';

/** How often each part of the snapshot is refreshed. */
export const REFRESH_MS = {
  markets: 10 * 60_000,
  global: 30 * 60_000,
  trending: 60 * 60_000,
  fearGreed: 60 * 60_000,
} as const;

export type PartKey = keyof typeof REFRESH_MS;

export interface BuildOptions {
  now: number;
  coingeckoKey?: string;
  /** Refresh every part regardless of age. */
  force?: boolean;
  /** Passed to fetchJson; tests use 0. */
  baseDelayMs?: number;
}

export interface BuildResult {
  snapshot: Snapshot;
  refreshed: PartKey[];
  errors: { part: PartKey; message: string }[];
}

/** One-minute slack so a cron firing slightly early still refreshes. */
const due = (part: Part<unknown> | null, everyMs: number, now: number) => !part || now - part.asOf >= everyMs - 60_000;

/**
 * Refresh whichever parts of the snapshot are due, trying each source in
 * order. A part that fails on every source keeps its last good value.
 */
export async function buildSnapshot(prev: Snapshot, fetchFn: FetchFn, breaker: CircuitBreaker, o: BuildOptions): Promise<BuildResult> {
  const cg = { apiKey: o.coingeckoKey, baseDelayMs: o.baseDelayMs };
  const net = { baseDelayMs: o.baseDelayMs };
  const next: Snapshot = { ...prev };
  const refreshed: PartKey[] = [];
  const errors: BuildResult['errors'] = [];

  async function refresh<K extends PartKey>(key: K, attempts: Attempt<NonNullable<Snapshot[K]>['data'], SourceName>[]) {
    if (!o.force && !due(prev[key], REFRESH_MS[key], o.now)) return;
    try {
      const { value, source } = await firstSuccessful(attempts, breaker);
      next[key] = { data: value, asOf: o.now, source } as Snapshot[K];
      refreshed.push(key);
    } catch (err) {
      errors.push({ part: key, message: err instanceof Error ? err.message : String(err) });
    }
  }

  await Promise.all([
    refresh('markets', [
      { name: 'coingecko', run: () => coingecko.fetchMarkets(fetchFn, cg) },
      { name: 'coinpaprika', run: async () => keepExtras(await coinpaprika.fetchMarkets(fetchFn, net), prev.markets?.data) },
    ]),
    refresh('global', [
      { name: 'coingecko', run: () => coingecko.fetchGlobal(fetchFn, cg) },
      { name: 'coinpaprika', run: () => coinpaprika.fetchGlobal(fetchFn, net) },
    ]),
    refresh('trending', [{ name: 'coingecko', run: () => coingecko.fetchTrending(fetchFn, cg) }]),
    refresh('fearGreed', [{ name: 'alternative.me', run: () => fetchFearGreed(fetchFn, net) }]),
  ]);

  return { snapshot: next, refreshed, errors };
}

/**
 * The CoinPaprika fallback has no sparklines and different logos. Reuse the
 * last CoinGecko values for coins we already know so the list looks the same.
 */
function keepExtras(assets: Asset[], previous: Asset[] | undefined): Asset[] {
  if (!previous) return assets;
  const byId = new Map(previous.map((a) => [a.id, a]));
  return assets.map((a) => {
    const old = byId.get(a.id);
    return old && old.symbol === a.symbol ? { ...a, image: old.image ?? a.image, sparkline: old.sparkline } : a;
  });
}

export async function fetchLivePrices(fetchFn: FetchFn, now: number, baseDelayMs?: number): Promise<PriceMap> {
  return { prices: await binance.fetchTickers(fetchFn, { baseDelayMs }), asOf: now, source: 'binance' };
}

/**
 * Overlay live exchange prices on the snapshot. A live price more than 10%
 * away from the snapshot is ignored: it is probably a different coin that
 * shares the ticker.
 */
export function withLivePrices(assets: Asset[], live: PriceMap | null): Asset[] {
  if (!live) return assets;
  return assets.map((a) => {
    const p = live.prices[a.symbol];
    if (!p || Math.abs(p.price - a.price) / a.price > 0.1) return a;
    return { ...a, price: p.price, change24h: p.change24h };
  });
}
