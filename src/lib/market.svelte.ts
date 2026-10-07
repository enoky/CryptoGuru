import { CANDLE_TTL_MS } from '../../shared/candles';
import { REFRESH_MS, withLivePrices, withSparklines } from '../../shared/snapshot';
import type { Asset, CandleSet, PriceMap, Range, Snapshot } from '../../shared/types';
import { loadCandles, loadPrices, loadSnapshot } from './api';
import { idbGet, idbSet } from './storage';

const SNAPSHOT_KEY = 'snapshot:v1';
const PRICE_POLL_MS = 60_000;

export const market = $state({
  snapshot: null as Snapshot | null,
  prices: null as PriceMap | null,
  /** True until we have something to show (cached or fresh). */
  loading: true,
  refreshing: false,
  /** Set when the latest refresh failed; cached data may still be shown. */
  error: null as string | null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
});

/** Snapshot assets with live exchange prices applied. */
export function assets(): Asset[] {
  return market.snapshot ? withLivePrices(withSparklines(market.snapshot), market.prices) : [];
}

export function findAsset(id: string): Asset | undefined {
  return assets().find((a) => a.id === id);
}

let started = false;

export async function startMarket() {
  if (started) return;
  started = true;
  const cached = await idbGet<Snapshot>(SNAPSHOT_KEY);
  if (cached?.markets && !market.snapshot) {
    market.snapshot = cached;
    market.loading = false;
  }
  await refresh();
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
    market.error = null;
    void idbSet(SNAPSHOT_KEY, $state.snapshot(snap));
  } catch (err) {
    market.error = err instanceof Error ? err.message : 'Refresh failed';
  } finally {
    market.refreshing = false;
    market.loading = false;
  }
}

async function refreshPrices() {
  try {
    market.prices = await loadPrices();
  } catch {
    // Live prices are an extra; the snapshot prices still show.
  }
}

/** Cached candles first (if any), then fresh ones when the cache is old. */
export async function getCandles(
  asset: Asset,
  range: Range,
  onCached: (set: CandleSet) => void,
): Promise<CandleSet> {
  const key = `candles:${asset.id}:${range}`;
  const cached = await idbGet<CandleSet>(key);
  if (cached?.candles?.length) {
    onCached(cached);
    if (Date.now() - cached.asOf < CANDLE_TTL_MS[range]) return cached;
  }
  try {
    const fresh = await loadCandles(asset.id, asset.symbol, asset.price, range);
    void idbSet(key, fresh);
    return fresh;
  } catch (err) {
    if (cached?.candles?.length) return cached;
    throw err;
  }
}
