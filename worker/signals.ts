import { fetchCandleSet } from '../shared/candles';
import type { CircuitBreaker } from '../shared/failover';
import type { FetchFn } from '../shared/http';
import { computeSignal, emptySignalsDoc, isStablecoin, type SignalsDoc } from '../shared/signals';
import type { Snapshot } from '../shared/types';

/** Each coin is re-rated about every 2 hours; signals on daily candles barely move faster than that. */
export const SIGNAL_REFRESH_MS = 2 * 60 * 60_000;
/** Coins that only CoinGecko has are re-rated twice a day, to protect its monthly quota. */
export const COINGECKO_REFRESH_MS = 12 * 60 * 60_000;
/**
 * Coins rated per cron run (every 10 min): ~90 coins cycle in under 2 hours.
 * Kept small for the free plan's 10 ms CPU limit per run, most of which goes
 * on parsing candle JSON. ⚠ Check CPU time in the Cloudflare dashboard after deploying.
 */
export const BATCH = 8;
/** 200-day average plus margin; fewer days means less JSON to parse. */
export const SIGNAL_DAYS = 250;
/** Leave this many requests unused in the per-run budget. */
const RESERVE = 3;

export interface SignalJobResult {
  doc: SignalsDoc;
  rated: string[];
  skipped: string[];
  changed: boolean;
}

/**
 * Rate the stalest coins in the top 100, as many as the batch size and the
 * run's request budget allow. Stablecoins aren't rated.
 */
export async function refreshSignals(
  prev: SignalsDoc | null,
  snapshot: Snapshot,
  fetchFn: FetchFn & { remaining: () => number },
  breaker: CircuitBreaker,
  o: { now: number; coingeckoKey?: string; baseDelayMs?: number; batch?: number },
): Promise<SignalJobResult> {
  const doc: SignalsDoc = prev ? { ...prev, items: { ...prev.items }, skipped: { ...prev.skipped } } : emptySignalsDoc();
  const assets = (snapshot.markets?.data ?? []).filter((a) => !isStablecoin(a.symbol));
  const fearGreed = snapshot.fearGreed?.data.value ?? null;
  const lastTouched = (id: string) => Math.max(doc.items[id]?.asOf ?? 0, doc.skipped[id] ?? 0);

  let changed = false;
  // Drop coins that left the top 100.
  const keep = new Set(assets.map((a) => a.id));
  for (const id of Object.keys(doc.items)) if (!keep.has(id)) (delete doc.items[id], (changed = true));
  for (const id of Object.keys(doc.skipped)) if (!keep.has(id)) (delete doc.skipped[id], (changed = true));

  const due = assets
    .filter((a) => o.now - lastTouched(a.id) >= SIGNAL_REFRESH_MS - 60_000)
    .sort((a, b) => lastTouched(a.id) - lastTouched(b.id));

  const rated: string[] = [];
  const skipped: string[] = [];
  for (const a of due.slice(0, o.batch ?? BATCH)) {
    if (fetchFn.remaining() < RESERVE) break;
    const prevItem = doc.items[a.id];
    try {
      const set = await fetchCandleSet({ id: a.id, symbol: a.symbol, refPrice: a.price, range: '1y', days: SIGNAL_DAYS }, fetchFn, breaker, {
        now: o.now,
        coingeckoKey: o.coingeckoKey,
        baseDelayMs: o.baseDelayMs,
        retries: 0,
        order: 'exchanges-first',
        allowCoinGecko: !prevItem || o.now - prevItem.asOf >= COINGECKO_REFRESH_MS,
      });
      const signal = computeSignal(a.id, set.candles, set.source, fearGreed, o.now);
      if (signal) {
        doc.items[a.id] = signal;
        delete doc.skipped[a.id];
        rated.push(a.id);
      } else {
        doc.skipped[a.id] = o.now;
        skipped.push(a.id);
      }
      changed = true;
    } catch {
      // Ran out of requests partway through this coin: leave it for the next run.
      if (fetchFn.remaining() <= 0) break;
      // Remember the attempt so one failing coin doesn't block the queue; the last good rating stays.
      doc.skipped[a.id] = o.now;
      skipped.push(a.id);
      changed = true;
    }
  }
  if (changed) doc.asOf = o.now;
  return { doc, rated, skipped, changed };
}
