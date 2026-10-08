import { describe, expect, it } from 'vitest';
import { AllSourcesFailed, CircuitBreaker, firstSuccessful } from '../../shared/failover';

describe('CircuitBreaker', () => {
  it('opens after 3 failures and closes after the cool-off', () => {
    let now = 0;
    const b = new CircuitBreaker(3, 1000, () => now);
    b.failure('x');
    b.failure('x');
    expect(b.isOpen('x')).toBe(false);
    b.failure('x');
    expect(b.isOpen('x')).toBe(true);
    now = 1001;
    expect(b.isOpen('x')).toBe(false);
  });

  it('resets the count on success', () => {
    const b = new CircuitBreaker(2);
    b.failure('x');
    b.success('x');
    b.failure('x');
    expect(b.isOpen('x')).toBe(false);
  });
});

describe('firstSuccessful', () => {
  it('falls through to the next source', async () => {
    const b = new CircuitBreaker();
    const r = await firstSuccessful(
      [
        { name: 'a', run: () => Promise.reject(new Error('down')) },
        { name: 'b', run: () => Promise.resolve(42) },
      ],
      b,
    );
    expect(r).toEqual({ value: 42, source: 'b' });
  });

  it('skips sources whose circuit is open', async () => {
    const b = new CircuitBreaker(1);
    b.failure('a');
    let called = false;
    const r = await firstSuccessful(
      [
        { name: 'a', run: async () => ((called = true), 1) },
        { name: 'b', run: async () => 2 },
      ],
      b,
    );
    expect(called).toBe(false);
    expect(r.source).toBe('b');
  });

  it('reports every failure when all sources fail', async () => {
    const p = firstSuccessful([{ name: 'a', run: () => Promise.reject(new Error('boom')) }], new CircuitBreaker());
    await expect(p).rejects.toBeInstanceOf(AllSourcesFailed);
    await expect(p).rejects.toThrow('a: boom');
  });
});

describe('not-available answers', () => {
  it('a source that lacks one item is not counted as down', async () => {
    const { NotAvailable } = await import('../../shared/failover');
    const { HttpError } = await import('../../shared/http');
    const b = new CircuitBreaker(3);
    const missing = [
      new NotAvailable('not listed'),
      new HttpError(400, 'https://x/klines?symbol=NOPE'),
      new HttpError(404, 'https://x/coins/nope'),
      new NotAvailable('again'),
    ];
    for (const err of missing) {
      await firstSuccessful([{ name: 'a', run: () => Promise.reject(err) }, { name: 'b', run: async () => 1 }], b);
    }
    expect(b.isOpen('a')).toBe(false);
    expect(b.state()).toEqual({});
  });

  it('real outages still open the circuit', async () => {
    const { HttpError } = await import('../../shared/http');
    const b = new CircuitBreaker(3);
    for (const status of [503, 429, 500]) {
      await firstSuccessful([{ name: 'a', run: () => Promise.reject(new HttpError(status, 'https://x/')) }, { name: 'b', run: async () => 1 }], b);
    }
    expect(b.isOpen('a')).toBe(true);
  });
});
