import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../worker/app';
import { healthyRoutes } from '../helpers/data';
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
const call = (path: string) => worker.fetch(new Request(`https://app.test${path}`), env, ctx());

beforeEach(async () => {
  vi.resetModules();
  ({ default: worker, SNAPSHOT_KEY } = await import('../../worker/app'));
  kv = new FakeKV();
  env = { SNAPSHOTS: kv as unknown as KVNamespace };
  vi.stubGlobal('fetch', mockFetch(healthyRoutes()));
});
afterEach(() => vi.unstubAllGlobals());

describe('worker', () => {
  it('cron refresh writes one snapshot to KV', async () => {
    const c = ctx();
    await worker.scheduled({ scheduledTime: Date.now(), cron: '*/10 * * * *', noRetry() {} } as ScheduledController, env, c);
    await Promise.all(c.waits);
    expect(kv.writes).toBe(1);
    const snap = JSON.parse(kv.store.get(SNAPSHOT_KEY)!);
    expect(snap.markets.data[0].id).toBe('bitcoin');
  });

  it('a second cron run soon after writes nothing', async () => {
    for (let i = 0; i < 2; i++) {
      const c = ctx();
      await worker.scheduled({ scheduledTime: Date.now(), cron: '', noRetry() {} } as ScheduledController, env, c);
      await Promise.all(c.waits);
    }
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

  it('rejects other methods and unknown API paths', async () => {
    expect((await worker.fetch(new Request('https://app.test/api/snapshot', { method: 'POST' }), env, ctx())).status).toBe(405);
    expect((await call('/api/nope')).status).toBe(404);
  });
});
