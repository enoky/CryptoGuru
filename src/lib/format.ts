import type { CurrencyCode } from '../../shared/currency';
import { displayCurrency } from './money.svelte';

interface Formatters {
  big: Intl.NumberFormat;
  normal: Intl.NumberFormat;
  small: Intl.NumberFormat;
  compact: Intl.NumberFormat;
}

const cache = new Map<CurrencyCode, Formatters>();

function formatters(code: CurrencyCode): Formatters {
  let f = cache.get(code);
  if (!f) {
    const money = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat('en-US', { style: 'currency', currency: code, ...opts });
    // Yen and similar have no minor unit: never show cents for them.
    const digits = money({}).resolvedOptions().maximumFractionDigits ?? 2;
    f = {
      big: money({ maximumFractionDigits: 0 }),
      normal: money({ minimumFractionDigits: digits, maximumFractionDigits: digits }),
      small: money({ maximumSignificantDigits: 4 }),
      compact: money({ notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    };
    cache.set(code, f);
  }
  return f;
}

/**
 * A US-dollar amount in the chosen display currency, sized to fit a phone:
 * $64,211 · $2.50 · $0.00001234 (or €59,034 · ¥9,612,345 …).
 */
export function formatPrice(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return '—';
  const { code, rate } = displayCurrency();
  const n = usd * rate;
  const f = formatters(code);
  if (n >= 10_000) return f.big.format(n);
  if (n >= 1) return f.normal.format(n);
  return f.small.format(n);
}

/** A US-dollar amount, shortened: $1.23T · €845.2M */
export function formatMoneyCompact(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return '—';
  const { code, rate } = displayCurrency();
  return formatters(code).compact.format(usd * rate);
}

const compactNum = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

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
