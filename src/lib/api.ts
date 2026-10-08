import { fetchCandleSet } from '../../shared/candles';
import { CircuitBreaker } from '../../shared/failover';
import { fetchJson } from '../../shared/http';
import { buildSnapshot, fetchLivePrices } from '../../shared/snapshot';
import { fetchFearGreedHistory } from '../../shared/sources/feargreed';
import type { SignalsDoc } from '../../shared/signals';
import { emptySnapshot, type CandleSet, type PriceMap, type Range, type Snapshot } from '../../shared/types';

/**
 * Data comes from our Worker (/api) first. If it's unreachable, the browser
 * calls the public APIs directly: they all allow cross-origin requests and
 * need no key, so the app keeps working, just with less caching.
 */
const breaker = new CircuitBreaker();
const browserFetch: typeof fetch = (...args) => fetch(...args);

const fromWorker = <T>(path: string) => fetchJson(browserFetch, path, { retries: 1, timeoutMs: 8000, baseDelayMs: 500 }) as Promise<T>;

export async function loadSnapshot(prev: Snapshot | null): Promise<Snapshot> {
  if (!breaker.isOpen('worker')) {
    try {
      const snap = await fromWorker<Snapshot>('/api/snapshot');
      if (!snap?.markets?.data?.length) throw new Error('empty snapshot');
      breaker.success('worker');
      return snap;
    } catch {
      breaker.failure('worker');
    }
  }
  const { snapshot, refreshed } = await buildSnapshot(prev ?? emptySnapshot(), browserFetch, breaker, {
    now: Date.now(),
    force: true,
    baseDelayMs: 500,
  });
  // buildSnapshot keeps old data when every source fails; that's still a failed refresh.
  if (!refreshed.includes('markets')) throw new Error('No market data available');
  return snapshot;
}

export async function loadPrices(): Promise<PriceMap> {
  if (!breaker.isOpen('worker-prices')) {
    try {
      const p = await fromWorker<PriceMap>('/api/prices');
      breaker.success('worker-prices');
      return p;
    } catch {
      breaker.failure('worker-prices');
    }
  }
  return fetchLivePrices(browserFetch, Date.now(), 500);
}

/**
 * Candles via the Worker need only the coin id, so they can load before market
 * data does. `coinInfo` (ticker and price, for checking exchange data) is only
 * awaited if we fall back to calling the exchanges directly.
 */
export async function loadCandles(
  id: string,
  range: Range,
  coinInfo: () => Promise<{ symbol: string; price: number } | undefined>,
): Promise<CandleSet> {
  if (!breaker.isOpen('worker-candles')) {
    try {
      const set = await fromWorker<CandleSet>(`/api/candles/${encodeURIComponent(id)}?range=${range}`);
      if (!set?.candles?.length) throw new Error('empty candles');
      breaker.success('worker-candles');
      return set;
    } catch {
      breaker.failure('worker-candles');
    }
  }
  const info = await coinInfo();
  return fetchCandleSet({ id, symbol: info?.symbol, refPrice: info?.price, range }, browserFetch, breaker, { now: Date.now(), baseDelayMs: 500 });
}

/**
 * Ratings for every coin come only from the Worker: computing them in the
 * browser would mean ~90 chart downloads. Coin pages compute their own.
 */
export async function loadSignals(): Promise<SignalsDoc> {
  const doc = await fromWorker<SignalsDoc>('/api/signals');
  if (!doc || typeof doc.items !== 'object') throw new Error('Bad signals response');
  return doc;
}

/** ~1000 daily candles for the backtest: Worker first, then the exchanges directly. */
export async function loadHistory(id: string, symbol: string, refPrice: number): Promise<CandleSet> {
  try {
    const set = await fromWorker<CandleSet>(`/api/history/${encodeURIComponent(id)}`);
    if (set?.candles?.length) return set;
  } catch {
    // fall through to the exchanges
  }
  return fetchCandleSet({ id, symbol, refPrice, range: '1y', days: 1000 }, browserFetch, breaker, {
    now: Date.now(),
    baseDelayMs: 500,
    order: 'exchanges-first',
    allowCoinGecko: false,
  });
}

export async function loadFearGreedHistory(): Promise<{ t: number; value: number }[]> {
  try {
    const rows = await fromWorker<{ t: number; value: number }[]>('/api/fear-greed/history');
    if (Array.isArray(rows) && rows.length) return rows;
  } catch {
    // fall through
  }
  return fetchFearGreedHistory(browserFetch, { baseDelayMs: 500 });
}
