export type FetchFn = typeof fetch;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status} from ${new URL(url).host}`);
  }
}

export interface FetchJsonOptions {
  headers?: Record<string, string>;
  /** Extra attempts after the first, for 429 and 5xx responses and network errors. */
  retries?: number;
  timeoutMs?: number;
  /** First backoff delay; doubles each retry, with jitter. */
  baseDelayMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const retryable = (status: number) => status === 429 || status >= 500;

/** GET a URL as JSON, retrying with exponential backoff and honouring Retry-After. */
export async function fetchJson(fetchFn: FetchFn, url: string, opts: FetchJsonOptions = {}): Promise<unknown> {
  const { headers = {}, retries = 2, timeoutMs = 8000, baseDelayMs = 1000 } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const backoff = baseDelayMs * 2 ** (attempt - 1);
      const retryAfter = lastError instanceof RetryAfterError ? lastError.ms : 0;
      await sleep(Math.min(Math.max(backoff + Math.random() * baseDelayMs * 0.3, retryAfter), 4000));
    }
    try {
      const res = await fetchFn(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return await res.json();
      if (!retryable(res.status)) throw new HttpError(res.status, url);
      const ra = Number(res.headers.get('retry-after'));
      lastError = Number.isFinite(ra) && ra > 0 ? new RetryAfterError(res.status, url, ra * 1000) : new HttpError(res.status, url);
    } catch (err) {
      if (err instanceof HttpError && !retryable(err.status)) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

class RetryAfterError extends HttpError {
  constructor(
    status: number,
    url: string,
    readonly ms: number,
  ) {
    super(status, url);
  }
}
