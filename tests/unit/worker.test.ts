import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../worker/app';
import { cgChart, healthyRoutes } from '../helpers/data';
import { COINGECKO_BASE } from '../../shared/sources/coingecko';
import { mockFetch } from '../helpers/mockFetch';

class FakeKV {
  store = new Map<string, string>();
  writes = 0;
  async get(key: string, type?: string) {
    const v = this.store.get(key);
    return v == null ? null : type === 'json' ? JSON.parse(v) : v;
  }
  async put(key: string, value: string) {
    this.writes++;
    this.store.set(key, value);
  }
}

const ctx = () => {
  const waits: Promise<unknown>[] = [];
  return { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException() {}, props: {}, waits } as unknown as ExecutionContext & {
    waits: Promise<unknown>[];
  };
};

let kv: FakeKV;
let env: Env;
// The Worker keeps caches and breakers in module state, like a real isolate; load a fresh copy per test.
let worker: typeof import('../../worker/app').default;
let SNAPSHOT_KEY: string;
let SIGNALS_KEY: string;
const call = (path: string) => worker.fetch(new Request(`https://app.test${path}`), env, ctx());

beforeEach(async () => {
  vi.resetModules();
  ({ default: worker, SNAPSHOT_KEY, SIGNALS_KEY } = await import('../../worker/app'));
  kv = new FakeKV();
  env = { SNAPSHOTS: kv as unknown as KVNamespace };
  vi.stubGlobal('fetch', mockFetch(healthyRoutes()));
});
afterEach(() => vi.unstubAllGlobals());

describe('worker', () => {
  const cron = async (schedule: string) => {
    const c = ctx();
    await worker.scheduled({ scheduledTime: Date.now(), cron: schedule, noRetry() {} } as ScheduledController, env, c);
    await Promise.all(c.waits);
  };

  it('snapshot cron writes the snapshot; signals cron then rates coins', async () => {
    await cron('*/10 * * * *');
    expect(kv.writes).toBe(1);
    expect(JSON.parse(kv.store.get(SNAPSHOT_KEY)!).markets.data[0].id).toBe('bitcoin');
    await cron('5-59/10 * * * *');
    expect(kv.writes).toBe(2);
    const signals = JSON.parse(kv.store.get(SIGNALS_KEY)!);
    expect(Object.keys(signals.items).sort()).toEqual(['bitcoin', 'ethereum']); // tether is a stablecoin
  });

  it('signals cron does nothing before there is a snapshot', async () => {
    await cron('5-59/10 * * * *');
    expect(kv.writes).toBe(0);
  });

  it('/api/signals serves the ratings', async () => {
    await cron('*/10 * * * *');
    await cron('5-59/10 * * * *');
    const body = (await (await call('/api/signals')).json()) as { items: Record<string, { label: string }> };
    expect(body.items.bitcoin.label).toBeTruthy();
  });

  it('/api/signals is empty before the first cron run', async () => {
    const body = (await (await call('/api/signals')).json()) as { items: object };
    expect(body.items).toEqual({});
  });

  it('a second snapshot run soon after writes nothing', async () => {
    await cron('*/10 * * * *');
    await cron('*/10 * * * *');
    expect(kv.writes).toBe(1);
  });

  it('/api/snapshot fills an empty KV on first request', async () => {
    const res = await call('/api/snapshot');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('max-age=60');
    expect(((await res.json()) as { markets: { source: string } }).markets.source).toBe('coingecko');
    expect(kv.writes).toBe(1);
  });

  it('/api/candles validates input', async () => {
    expect((await call('/api/candles/bitcoin?range=5y')).status).toBe(400);
    expect((await call('/api/candles/Bad_Id')).status).toBe(404);
  });

  it('/api/candles returns candles', async () => {
    await call('/api/snapshot');
    const res = await call('/api/candles/bitcoin?range=7d');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { source: string; candles: unknown[] };
    expect(body.source).toBe('binance');
    expect(body.candles.length).toBe(168);
  });

  it('/api/prices returns live prices', async () => {
    const body = (await (await call('/api/prices')).json()) as { prices: Record<string, unknown> };
    expect(body.prices.BTC).toBeDefined();
  });

  it('/api/health reports part ages', async () => {
    await call('/api/snapshot');
    const res = await call('/api/health');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { parts: { markets: { source: string } } }).parts.markets.source).toBe('coingecko');
  });

  it('/api/history serves ~1000 daily candles from the exchanges only', async () => {
    await call('/api/snapshot');
    const f = globalThis.fetch as typeof fetch & { calls: string[] };
    const res = await call('/api/history/bitcoin');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { source: string }).source).toBe('binance');
    expect(f.calls.find((u) => u.includes('klines'))).toContain('limit=1000');
    expect((await call('/api/history/tether')).status).toBe(404); // stablecoin
    expect((await call('/api/history/not-a-coin')).status).toBe(404);
  });

  it('/api/health judges each rating against its own refresh cycle', async () => {
    await call('/api/snapshot');
    const now = Date.now();
    const h = 3_600_000;
    const item = (id: string, source: string, ageHours: number) => ({ id, source, asOf: now - ageHours * h });
    kv.store.set(
      SIGNALS_KEY,
      JSON.stringify({
        version: 3,
        asOf: now - 5 * 60_000,
        market: { btcReturn90d: 12, breadth: 40, breadthCoins: 60 },
        items: {
          a: item('a', 'binance', 1),
          b: item('b', 'binance', 7), // exchange ratings refresh every 2 h: 7 h old is stale
          c: item('c', 'coingecko', 10), // CoinGecko ratings refresh every 12 h: fine
          d: item('d', 'coingecko', 17), // stale
        },
        skipped: { c: now, e: now }, // c was retried (still has a rating); e has none
        pegged: { f: now },
      }),
    );
    const body = (await (await call('/api/health')).json()) as { signals: Record<string, number> };
    expect(body.signals).toEqual({
      rated: 4,
      stale: 2,
      fromCoinGecko: 2,
      unrated: 1,
      lastRunSecondsAgo: 300,
      pegged: 1,
      market: { btcReturn90d: 12, breadth: 40, breadthCoins: 60 },
    });
  });

  it('ignores ratings stored in the old format until the next run replaces them', async () => {
    await call('/api/snapshot');
    kv.store.set(SIGNALS_KEY, JSON.stringify({ asOf: Date.now(), items: { a: { id: 'a', signals: { mood: 1 } } }, skipped: {} }));
    const body = (await (await call('/api/signals')).json()) as { version: number; items: object };
    expect(body.version).toBe(3);
    expect(body.items).toEqual({});
    const health = (await (await call('/api/health')).json()) as { signals: { rated: number } };
    expect(health.signals.rated).toBe(0);
  });

  it('requests for unknown coins do not switch a source off', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(healthyRoutes({ [`${COINGECKO_BASE}/coins/`]: (url: string) => (url.includes('/coins/bitcoin/') ? cgChart(64000) : 404) })),
    );
    await call('/api/snapshot');
    for (const id of ['nope-1', 'nope-2', 'nope-3', 'nope-4']) expect((await call(`/api/candles/${id}?range=7d`)).status).toBe(502);
    const health = (await (await call('/api/health')).json()) as { breakers: Record<string, string> };
    expect(health.breakers).toEqual({});
  });

  it('/api/fear-greed/history returns the daily history oldest first', async () => {
    const rows = (await (await call('/api/fear-greed/history')).json()) as { t: number; value: number }[];
    expect(rows).toHaveLength(40);
    expect(rows[0].t).toBeLessThan(rows[1].t);
  });

  it('rejects other methods and unknown API paths', async () => {
    expect((await worker.fetch(new Request('https://app.test/api/snapshot', { method: 'POST' }), env, ctx())).status).toBe(405);
    expect((await call('/api/nope')).status).toBe(404);
  });
});
