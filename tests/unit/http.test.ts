import { describe, expect, it } from 'vitest';
import { fetchJson, HttpError } from '../../shared/http';
import { mockFetch } from '../helpers/mockFetch';

describe('fetchJson', () => {
  it('retries 429 and 5xx, then succeeds', async () => {
    let n = 0;
    const f = mockFetch({ 'https://x/': () => (++n < 3 ? (n === 1 ? 429 : 503) : { ok: true }) });
    await expect(fetchJson(f, 'https://x/a', { baseDelayMs: 0 })).resolves.toEqual({ ok: true });
    expect(f.calls).toHaveLength(3);
  });

  it('does not retry a 404', async () => {
    const f = mockFetch({ 'https://x/': () => 404 });
    await expect(fetchJson(f, 'https://x/a', { baseDelayMs: 0 })).rejects.toBeInstanceOf(HttpError);
    expect(f.calls).toHaveLength(1);
  });

  it('gives up after the retry budget', async () => {
    const f = mockFetch({ 'https://x/': () => 500 });
    await expect(fetchJson(f, 'https://x/a', { retries: 1, baseDelayMs: 0 })).rejects.toThrow('HTTP 500');
    expect(f.calls).toHaveLength(2);
  });

  it('retries network errors', async () => {
    let n = 0;
    const f = mockFetch({ 'https://x/': () => (++n === 1 ? new Error('reset') : [1]) });
    await expect(fetchJson(f, 'https://x/a', { baseDelayMs: 0 })).resolves.toEqual([1]);
  });
});
