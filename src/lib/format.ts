const usd = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', ...opts });

const big = usd({ maximumFractionDigits: 0 });
const normal = usd({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
const small = usd({ maximumSignificantDigits: 4 });
const compact = usd({ notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const compactNum = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

/** $64,210 · $2.51 · $0.00001234 */
export function formatPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 10_000) return big.format(n);
  if (n >= 1) return normal.format(n);
  return small.format(n);
}

/** $1.23T · $845.2M */
export function formatUsdCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return compact.format(n);
}

/** 19.8M */
export function formatCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return compactNum.format(n);
}

/** +2.10% · −0.45% (true minus sign) */
export function formatPct(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n).toFixed(digits);
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${abs}%`;
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(ms: number, withTime = false): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: withTime ? undefined : 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export type Freshness = 'fresh' | 'aging' | 'stale';

/** Amber after 2× the refresh interval, red after 6×. */
export function freshness(asOf: number, ttlMs: number, now = Date.now()): Freshness {
  const age = now - asOf;
  return age > 6 * ttlMs ? 'stale' : age > 2 * ttlMs ? 'aging' : 'fresh';
}

export const direction = (n: number | null | undefined): 'up' | 'down' | 'flat' =>
  n == null || !Number.isFinite(n) || n === 0 ? 'flat' : n > 0 ? 'up' : 'down';

const SOURCE_LABEL: Record<string, string> = {
  coingecko: 'CoinGecko',
  coinpaprika: 'CoinPaprika',
  binance: 'Binance',
  kraken: 'Kraken',
  'alternative.me': 'Alternative.me',
};

export const sourceLabel = (s: string | undefined) => (s ? (SOURCE_LABEL[s] ?? s) : '—');
