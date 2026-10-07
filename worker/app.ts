import { CANDLE_TTL_MS, fetchCandleSet } from '../shared/candles';
import { CircuitBreaker } from '../shared/failover';
import { buildSnapshot, fetchLivePrices, REFRESH_MS } from '../shared/snapshot';
import { emptySnapshot, RANGES, type Range, type Snapshot } from '../shared/types';
import { TtlCache } from './cache';

export interface Env {
  SNAPSHOTS: KVNamespace;
  ASSETS?: Fetcher;
  /** Free CoinGecko Demo key, set with `wrangler secret put`. Optional. */
  COINGECKO_DEMO_KEY?: string;
}

export const SNAPSHOT_KEY = 'snapshot:v1';

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
export async function refreshSnapshot(env: Env, now: number, force = false) {
  const prev = (await readSnapshot(env)) ?? emptySnapshot();
  const result = await buildSnapshot(prev, fetch, breaker, { now, coingeckoKey: env.COINGECKO_DEMO_KEY, force });
  if (result.refreshed.length) await env.SNAPSHOTS.put(SNAPSHOT_KEY, JSON.stringify(result.snapshot));
  for (const e of result.errors) console.warn(`refresh ${e.part} failed: ${e.message}`);
  return result;
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

async function handleHealth(env: Env, now: number) {
  const snap = await readSnapshot(env);
  const age = (p: { asOf: number; source: string } | null | undefined) =>
    p ? { ageSeconds: Math.round((now - p.asOf) / 1000), source: p.source } : null;
  const parts = snap
    ? { markets: age(snap.markets), global: age(snap.global), trending: age(snap.trending), fearGreed: age(snap.fearGreed) }
    : null;
  const ok = !!snap?.markets && now - snap.markets.asOf < 3 * REFRESH_MS.markets;
  return json({ ok, parts, breakers: breaker.state(), coingeckoKey: !!env.COINGECKO_DEMO_KEY }, ok ? 200 : 503);
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
      if (url.pathname === '/api/health') return await handleHealth(env, now);
      return json({ error: 'Not found' }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: 'Upstream data sources are unavailable' }, 502);
    }
  },

  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(refreshSnapshot(env, event.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
