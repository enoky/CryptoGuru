import { budgetedFetch } from '../shared/budget';
import { CANDLE_TTL_MS, fetchCandleSet } from '../shared/candles';
import { CircuitBreaker } from '../shared/failover';
import { buildSnapshot, fetchLivePrices, REFRESH_MS } from '../shared/snapshot';
import { fetchFearGreedHistory } from '../shared/sources/feargreed';
import { emptySignalsDoc, isStablecoin, SIGNALS_VERSION } from '../shared/signals';
import type { FetchFn } from '../shared/http';
import type { SignalsDoc } from '../shared/signals';
import { emptySnapshot, RANGES, type Range, type Snapshot } from '../shared/types';
import { TtlCache } from './cache';
import { COINGECKO_REFRESH_MS, refreshSignals, SIGNAL_REFRESH_MS } from './signals';

export interface Env {
  SNAPSHOTS: KVNamespace;
  ASSETS?: Fetcher;
  /** Free CoinGecko Demo key, set with `wrangler secret put`. Optional. */
  COINGECKO_DEMO_KEY?: string;
}

export const SNAPSHOT_KEY = 'snapshot:v1';
export const SIGNALS_KEY = 'signals:v1';
/** Free Workers may make 50 outbound requests per run; keep some headroom. */
export const REQUEST_BUDGET = 45;

const breaker = new CircuitBreaker();
const cache = new TtlCache();
let lastInlineRefresh = 0;

const json = (body: unknown, status = 200, maxAge = 0) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': maxAge ? `public, max-age=${maxAge}` : 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });

async function readSnapshot(env: Env): Promise<Snapshot | null> {
  return env.SNAPSHOTS.get<Snapshot>(SNAPSHOT_KEY, 'json');
}

/** Refresh due parts and save. Writes to KV only when something changed. */
export async function refreshSnapshot(env: Env, now: number, fetchFn: FetchFn = budgetedFetch(fetch, REQUEST_BUDGET)) {
  const prev = (await readSnapshot(env)) ?? emptySnapshot();
  const result = await buildSnapshot(prev, fetchFn, breaker, { now, coingeckoKey: env.COINGECKO_DEMO_KEY });
  if (result.refreshed.length) await env.SNAPSHOTS.put(SNAPSHOT_KEY, JSON.stringify(result.snapshot));
  for (const e of result.errors) console.warn(`refresh ${e.part} failed: ${e.message}`);
  return result;
}

/** Cron schedules (also in wrangler.toml). Each run gets its own 10 ms CPU and 50-request allowance. */
export const SNAPSHOT_CRON = '*/10 * * * *';
export const SIGNALS_CRON = '5-59/10 * * * *';

/** Rate the next batch of coins, using the stored snapshot. */
export async function runSignals(env: Env, now: number) {
  const snapshot = await readSnapshot(env);
  if (!snapshot?.markets) return;
  const prev = await env.SNAPSHOTS.get<SignalsDoc>(SIGNALS_KEY, 'json');
  const result = await refreshSignals(prev, snapshot, budgetedFetch(fetch, REQUEST_BUDGET), breaker, {
    now,
    coingeckoKey: env.COINGECKO_DEMO_KEY,
  });
  if (result.changed) await env.SNAPSHOTS.put(SIGNALS_KEY, JSON.stringify(result.doc));
}

async function handleSnapshot(env: Env, ctx: ExecutionContext, now: number) {
  let snap = await readSnapshot(env);
  if (!snap?.markets) {
    // First run before the cron has fired: fetch now so the page isn't empty.
    if (now - lastInlineRefresh > 60_000) {
      lastInlineRefresh = now;
      snap = (await refreshSnapshot(env, now)).snapshot;
    }
  } else if (now - snap.markets.asOf > 3 * REFRESH_MS.markets && now - lastInlineRefresh > 5 * 60_000) {
    // The cron seems stuck: refresh in the background, serve what we have.
    lastInlineRefresh = now;
    ctx.waitUntil(refreshSnapshot(env, now));
  }
  if (!snap?.markets) return json({ error: 'No market data available yet' }, 503);
  return json(snap, 200, 60);
}

async function handleCandles(env: Env, url: URL, id: string, now: number) {
  const range = (url.searchParams.get('range') ?? '7d') as Range;
  if (!RANGES.includes(range)) return json({ error: 'range must be 7d, 30d or 1y' }, 400);
  const snap = await cache.get('snapshot', 60_000, () => readSnapshot(env));
  const asset = snap?.markets?.data.find((a) => a.id === id);
  const set = await cache.get(`candles:${id}:${range}`, CANDLE_TTL_MS[range], () =>
    fetchCandleSet({ id, symbol: asset?.symbol, refPrice: asset?.price, range }, fetch, breaker, {
      now,
      coingeckoKey: env.COINGECKO_DEMO_KEY,
    }),
  );
  return json(set, 200, Math.floor(CANDLE_TTL_MS[range] / 1000));
}

/** Daily candles for the backtest. Changes once a day, so cached for 12 hours. */
export const HISTORY_DAYS = 1000;
const HISTORY_TTL_MS = 12 * 60 * 60_000;

async function handleHistory(env: Env, id: string, now: number) {
  const snap = await cache.get('snapshot', 60_000, () => readSnapshot(env));
  const asset = snap?.markets?.data.find((a) => a.id === id);
  if (!asset) return json({ error: 'Only coins in the current top 100 have history' }, 404);
  if (isStablecoin(asset.symbol)) return json({ error: 'Stablecoins are not backtested' }, 404);
  const set = await cache.get(`history:${id}`, HISTORY_TTL_MS, () =>
    // Exchanges only: CoinGecko's free plan has just one year of history.
    fetchCandleSet({ id, symbol: asset.symbol, refPrice: asset.price, range: '1y', days: HISTORY_DAYS }, fetch, breaker, {
      now,
      order: 'exchanges-first',
      allowCoinGecko: false,
    }),
  );
  return json(set, 200, HISTORY_TTL_MS / 1000);
}

async function handleSignals(env: Env) {
  const doc = await cache.get('signals', 60_000, () => env.SNAPSHOTS.get<SignalsDoc>(SIGNALS_KEY, 'json'));
  // Until the first run after an upgrade, the stored ratings are in the old format: serve none rather than misread them.
  return json(doc?.version === SIGNALS_VERSION ? doc : emptySignalsDoc(), 200, 300);
}

async function handleHealth(env: Env, now: number) {
  const snap = await readSnapshot(env);
  const stored = await env.SNAPSHOTS.get<SignalsDoc>(SIGNALS_KEY, 'json');
  const signals = stored?.version === SIGNALS_VERSION ? stored : null;
  const rated = signals ? Object.values(signals.items) : [];
  // Ratings from CoinGecko are refreshed only twice a day by design (to save its monthly quota),
  // so each rating is judged against its own cycle, with two missed batch cycles of slack.
  const cycle = (source: string) => (source === 'coingecko' ? COINGECKO_REFRESH_MS : SIGNAL_REFRESH_MS);
  const signalInfo = {
    rated: rated.length,
    stale: rated.filter((s) => now - s.asOf > cycle(s.source) + 2 * SIGNAL_REFRESH_MS).length,
    fromCoinGecko: rated.filter((s) => s.source === 'coingecko').length,
    /** Coins tried but with no rating at all (too little history, or no source has them). */
    unrated: signals ? Object.keys(signals.skipped).filter((id) => !signals.items[id]).length : 0,
    lastRunSecondsAgo: signals?.asOf ? Math.round((now - signals.asOf) / 1000) : null,
    market: signals?.market ?? null,
  };
  const age = (p: { asOf: number; source: string } | null | undefined) =>
    p ? { ageSeconds: Math.round((now - p.asOf) / 1000), source: p.source } : null;
  const parts = snap
    ? { markets: age(snap.markets), global: age(snap.global), trending: age(snap.trending), fearGreed: age(snap.fearGreed) }
    : null;
  const ok = !!snap?.markets && now - snap.markets.asOf < 3 * REFRESH_MS.markets;
  return json({ ok, parts, signals: signalInfo, breakers: breaker.state(), coingeckoKey: !!env.COINGECKO_DEMO_KEY }, ok ? 200 : 503);
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Not found', { status: 404 });
    }
    if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    const now = Date.now();
    try {
      if (url.pathname === '/api/snapshot') return await handleSnapshot(env, ctx, now);
      if (url.pathname === '/api/prices') {
        return json(await cache.get('prices', 30_000, () => fetchLivePrices(fetch, now)), 200, 30);
      }
      const m = url.pathname.match(/^\/api\/candles\/([a-z0-9-]{1,80})$/);
      if (m) return await handleCandles(env, url, m[1], now);
      if (url.pathname === '/api/signals') return await handleSignals(env);
      if (url.pathname === '/api/fear-greed/history') {
        return json(await cache.get('fng-history', HISTORY_TTL_MS, () => fetchFearGreedHistory(fetch)), 200, HISTORY_TTL_MS / 1000);
      }
      const h = url.pathname.match(/^\/api\/history\/([a-z0-9-]{1,80})$/);
      if (h) return await handleHistory(env, h[1], now);
      if (url.pathname === '/api/health') return await handleHealth(env, now);
      return json({ error: 'Not found' }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: 'Upstream data sources are unavailable' }, 502);
    }
  },

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(event.cron === SIGNALS_CRON ? runSignals(env, event.scheduledTime) : refreshSnapshot(env, event.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
