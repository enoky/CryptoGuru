import * as v from 'valibot';
import { fetchJson, type FetchFn } from '../http';
import type { Candle, Range } from '../types';
import { parseNumericRows, parseOne } from '../validate';

export const KRAKEN_BASE = 'https://api.kraken.com/0/public';

const RANGE: Record<Range, { interval: number; count: number }> = {
  '7d': { interval: 60, count: 168 },
  '30d': { interval: 240, count: 180 },
  '1y': { interval: 1440, count: 365 },
};

const ResponseSchema = v.object({ error: v.array(v.string()), result: v.optional(v.record(v.string(), v.unknown())) });

/** Kraken calls Bitcoin "XBT". */
export const krakenPair = (symbol: string) => `${symbol === 'BTC' ? 'XBT' : symbol}USD`;

export async function fetchCandles(
  fetchFn: FetchFn,
  symbol: string,
  range: Range,
  o: { retries?: number; baseDelayMs?: number; days?: number } = {},
): Promise<Candle[]> {
  if (!/^[A-Z0-9]{2,12}$/.test(symbol)) throw new Error(`Kraken: unsupported symbol ${symbol}`);
  const { interval } = RANGE[range];
  const count = range === '1y' && o.days ? o.days : RANGE[range].count;
  const raw = await fetchJson(fetchFn, `${KRAKEN_BASE}/OHLC?pair=${krakenPair(symbol)}&interval=${interval}`, o);
  const res = parseOne(ResponseSchema, raw, 'Kraken OHLC');
  if (res.error.length) throw new Error(`Kraken: ${res.error[0]}`);
  const key = Object.keys(res.result ?? {}).find((k) => k !== 'last');
  if (!key) throw new Error('Kraken: no data');
  return parseNumericRows(res.result![key], 7, 'Kraken OHLC rows')
    .slice(-count)
    .map(([t, op, h, l, c, , vol]) => ({ t: t * 1000, o: op, h, l, c, v: vol }));
}
