import * as v from 'valibot';
import { fetchJson, type FetchFn } from '../http';
import type { Candle, LivePrice, Range } from '../types';
import { NotAvailable } from '../failover';
import { isPositive, numeric, parseItems, parseNumericRows } from '../validate';

/**
 * Binance's public market-data mirror. Unlike api.binance.com it isn't
 * geo-blocked for US visitors and servers.
 */
export const BINANCE_BASE = 'https://data-api.binance.vision/api/v3';

/** Stablecoins priced at ~$1 have no useful USDT pair. */
const NO_USDT_PAIR = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'TUSD', 'USDE', 'USDS', 'PYUSD', 'USD1', 'BUSD']);

export const hasUsdtPair = (symbol: string) => /^[A-Z0-9]{2,12}$/.test(symbol) && !NO_USDT_PAIR.has(symbol);

const MiniTickerSchema = v.object({ symbol: v.string(), openPrice: numeric, lastPrice: numeric });

/** 24h price and change for every USDT pair, keyed by base symbol ("BTC"). */
export async function fetchTickers(fetchFn: FetchFn, o: { retries?: number; baseDelayMs?: number } = {}): Promise<Record<string, LivePrice>> {
  const raw = await fetchJson(fetchFn, `${BINANCE_BASE}/ticker/24hr?type=MINI`, o);
  const out: Record<string, LivePrice> = {};
  for (const t of parseItems(MiniTickerSchema, raw, 'Binance tickers')) {
    if (!t.symbol.endsWith('USDT') || !isPositive(t.lastPrice) || !isPositive(t.openPrice)) continue;
    const base = t.symbol.slice(0, -4);
    if (!hasUsdtPair(base)) continue;
    out[base] = { price: t.lastPrice, change24h: ((t.lastPrice - t.openPrice) / t.openPrice) * 100 };
  }
  if (Object.keys(out).length === 0) throw new Error('Binance tickers: no USDT pairs');
  return out;
}

const KLINES: Record<Range, { interval: string; limit: number }> = {
  '7d': { interval: '1h', limit: 168 },
  '30d': { interval: '4h', limit: 180 },
  '1y': { interval: '1d', limit: 365 },
};

/** `days` overrides how many daily candles to fetch for the 1y range. */
export async function fetchCandles(
  fetchFn: FetchFn,
  symbol: string,
  range: Range,
  o: { retries?: number; baseDelayMs?: number; days?: number } = {},
): Promise<Candle[]> {
  if (!hasUsdtPair(symbol)) throw new NotAvailable(`Binance: no USDT pair for ${symbol}`);
  const { interval } = KLINES[range];
  const limit = range === '1y' && o.days ? o.days : KLINES[range].limit;
  const raw = await fetchJson(fetchFn, `${BINANCE_BASE}/klines?symbol=${symbol}USDT&interval=${interval}&limit=${limit}`, o);
  return parseNumericRows(raw, 6, 'Binance klines').map(([t, op, h, l, c, vol]) => ({ t, o: op, h, l, c, v: vol }));
}
