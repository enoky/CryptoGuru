import { CANDLE_TTL_MS } from '../../shared/candles';
import { REFRESH_MS, withLivePrices, withSparklines } from '../../shared/snapshot';
import type { Asset, CandleSet, PriceMap, Range, Snapshot } from '../../shared/types';
import { loadCandles, loadPrices, loadSnapshot } from './api';
import { setRates } from './money.svelte';
import { afterFirstPaint } from './paint';
import { idbGet, idbSet } from './storage';

const SNAPSHOT_KEY = 'snapshot:v1';
const PRICE_POLL_MS = 60_000;

/**
 * Market state. The snapshot and prices are big and only ever replaced whole,
 * so they are stored raw (not deeply reactive): cheaper on slow phones.
 */
class MarketState {
  snapshot = $state.raw<Snapshot | null>(null);
  prices = $state.raw<PriceMap | null>(null);
  /** True until we have something to show (cached or fresh). */
  loading = $state(true);
  refreshing = $state(false);
  /** Set when the latest refresh failed; cached data may still be shown. */
  error = $state<string | null>(null);
  online = $state(typeof navigator === 'undefined' ? true : navigator.onLine);
  /** Snapshot assets with sparklines and live exchange prices applied; recomputed only when those change. */
  assets = $derived(this.snapshot ? withLivePrices(withSparklines(this.snapshot), this.prices) : []);
}

export const market = new MarketState();

export function assets(): Asset[] {
  return market.assets;
}

export function findAsset(id: string): Asset | undefined {
  return assets().find((a) => a.id === id);
}

let started = false;

export async function startMarket() {
  if (started) return;
  started = true;
  await afterFirstPaint();
  // Read the saved copy and fetch fresh data at the same time; the saved copy shows only if it lands first.
  const showCached = idbGet<Snapshot>(SNAPSHOT_KEY).then((cached) => {
    if (cached?.markets && !market.snapshot) {
      market.snapshot = cached;
      setRates(cached.global?.data.fx);
      market.loading = false;
    }
  });
  await Promise.all([showCached, refresh()]);
  void refreshPrices();

  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    const asOf = market.snapshot?.markets?.asOf ?? 0;
    if (Date.now() - asOf > REFRESH_MS.markets / 2) void refresh();
    void refreshPrices();
  }, PRICE_POLL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refresh();
  });
  addEventListener('online', () => {
    market.online = true;
    void refresh();
  });
  addEventListener('offline', () => (market.online = false));
}

export async function refresh() {
  if (market.refreshing) return;
  market.refreshing = true;
  try {
    const snap = await loadSnapshot(market.snapshot);
    market.snapshot = snap;
    setRates(snap.global?.data.fx);
    market.error = null;
    void idbSet(SNAPSHOT_KEY, snap);
  } catch (err) {
    market.error = err instanceof Error ? err.message : 'Refresh failed';
  } finally {
    market.refreshing = false;
    market.loading = false;
  }
}

export async function refreshPrices() {
  try {
    market.prices = await loadPrices();
  } catch {
    // Live prices are an extra; the snapshot prices still show.
  }
}

/** Resolves with the coin once market data has it, or undefined once market data has loaded without it. */
async function whenAsset(id: string): Promise<Asset | undefined> {
  for (let waited = 0; waited < 15_000; waited += 200) {
    const a = findAsset(id);
    if (a) return a;
    if (!market.loading && !market.refreshing) return undefined;
    await new Promise((r) => setTimeout(r, 200));
  }
  return undefined;
}

/** Cached candles first (if any), then fresh ones when the cache is old. Doesn't wait for market data. */
export async function getCandles(id: string, range: Range, onCached: (set: CandleSet) => void): Promise<CandleSet> {
  await afterFirstPaint();
  const key = `candles:${id}:${range}`;
  const cached = await idbGet<CandleSet>(key);
  if (cached?.candles?.length) {
    onCached(cached);
    if (Date.now() - cached.asOf < CANDLE_TTL_MS[range]) return cached;
  }
  try {
    const fresh = await loadCandles(id, range, () => whenAsset(id));
    void idbSet(key, fresh);
    return fresh;
  } catch (err) {
    if (cached?.candles?.length) return cached;
    throw err;
  }
}
