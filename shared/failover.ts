import { HttpError } from './http';

/**
 * The source works but doesn't have this item (e.g. a coin it doesn't list).
 * Not an outage, so it doesn't count towards switching the source off.
 */
export class NotAvailable extends Error {}

/** "Not listed here" answers: ours, and HTTP 400/404 from the source (e.g. Binance "Invalid symbol"). */
export const isNotAvailable = (err: unknown) =>
  err instanceof NotAvailable || (err instanceof HttpError && (err.status === 400 || err.status === 404));

/**
 * Skips a source for a cool-off period after repeated failures, so a dead API
 * doesn't slow every request down while we wait for it to time out.
 */
export class CircuitBreaker {
  private failures = new Map<string, number>();
  private openUntil = new Map<string, number>();

  constructor(
    private threshold = 3,
    private coolOffMs = 5 * 60_000,
    private now: () => number = Date.now,
  ) {}

  isOpen(name: string): boolean {
    return (this.openUntil.get(name) ?? 0) > this.now();
  }

  success(name: string): void {
    this.failures.delete(name);
    this.openUntil.delete(name);
  }

  failure(name: string): void {
    const n = (this.failures.get(name) ?? 0) + 1;
    this.failures.set(name, n);
    if (n >= this.threshold) {
      this.openUntil.set(name, this.now() + this.coolOffMs);
      this.failures.delete(name);
    }
  }

  state(): Record<string, 'open' | 'closed'> {
    const out: Record<string, 'open' | 'closed'> = {};
    for (const name of new Set([...this.failures.keys(), ...this.openUntil.keys()])) {
      out[name] = this.isOpen(name) ? 'open' : 'closed';
    }
    return out;
  }
}

export interface Attempt<T, S extends string = string> {
  /** Breaker key, e.g. "binance". */
  name: S;
  run: () => Promise<T>;
}

export class AllSourcesFailed extends Error {
  constructor(readonly errors: { name: string; message: string }[]) {
    super(`All sources failed: ${errors.map((e) => `${e.name}: ${e.message}`).join('; ')}`);
  }
}

/** Try each source in order, skipping ones whose breaker is open. */
export async function firstSuccessful<T, S extends string>(
  attempts: Attempt<T, S>[],
  breaker: CircuitBreaker,
): Promise<{ value: T; source: S }> {
  const errors: { name: string; message: string }[] = [];
  for (const a of attempts) {
    if (breaker.isOpen(a.name)) {
      errors.push({ name: a.name, message: 'skipped (circuit open)' });
      continue;
    }
    try {
      const value = await a.run();
      breaker.success(a.name);
      return { value, source: a.name };
    } catch (err) {
      // Only real outages (timeouts, rate limits, server errors, bad data) count against a source.
      if (!isNotAvailable(err)) breaker.failure(a.name);
      errors.push({ name: a.name, message: err instanceof Error ? err.message : String(err) });
    }
  }
  throw new AllSourcesFailed(errors);
}
