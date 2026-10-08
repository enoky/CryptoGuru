/** A fake fetch that answers by URL prefix. Handlers return a body, a status code, or a Response. */
export type Handler = (url: string) => unknown;

export function mockFetch(routes: Record<string, Handler>) {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    const key = Object.keys(routes)
      .filter((k) => url.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    if (!key) return new Response('not mocked', { status: 404 });
    const out = routes[key](url);
    if (out instanceof Response) return out;
    if (typeof out === 'number') return new Response('error', { status: out });
    if (out instanceof Error) throw out;
    return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return Object.assign(fn, { calls });
}
