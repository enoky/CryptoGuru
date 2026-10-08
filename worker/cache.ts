/**
 * Two cache layers: an in-memory map (per Worker isolate) and Cloudflare's
 * Cache API (per data centre). The Cache API does nothing on *.workers.dev
 * domains, so the memory layer is what protects upstream rate limits there.
 * Concurrent requests for the same key share one upstream fetch.
 */
export class TtlCache {
  private entries = new Map<string, { value: unknown; expires: number }>();
  private inflight = new Map<string, Promise<unknown>>();

  constructor(
    private maxEntries = 300,
    private now: () => number = Date.now,
  ) {}

  async get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.expires > this.now()) return hit.value as T;

    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;

    const p = (async () => {
      const edge = await edgeGet<T>(key);
      if (edge !== undefined) {
        this.set(key, edge, ttlMs);
        return edge;
      }
      const value = await load();
      this.set(key, value, ttlMs);
      await edgePut(key, value, ttlMs);
      return value;
    })().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private set(key: string, value: unknown, ttlMs: number) {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expires: this.now() + ttlMs });
  }
}

const edgeUrl = (key: string) => `https://cache.cryptoguru.internal/${encodeURIComponent(key)}`;

const edgeCache = (): Cache | undefined =>
  typeof caches !== 'undefined' ? (caches as unknown as { default: Cache }).default : undefined;

async function edgeGet<T>(key: string): Promise<T | undefined> {
  try {
    const res = await edgeCache()?.match(edgeUrl(key));
    return res ? ((await res.json()) as T) : undefined;
  } catch {
    return undefined;
  }
}

async function edgePut(key: string, value: unknown, ttlMs: number) {
  try {
    await edgeCache()?.put(
      edgeUrl(key),
      new Response(JSON.stringify(value), {
        headers: { 'content-type': 'application/json', 'cache-control': `max-age=${Math.floor(ttlMs / 1000)}` },
      }),
    );
  } catch {
    // The cache is an optimisation; ignore failures.
  }
}
