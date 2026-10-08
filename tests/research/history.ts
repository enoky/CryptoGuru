import type { FetchFn } from '../../shared/http';
import { cleanCandles } from '../../shared/series';
import { BINANCE_BASE, hasUsdtPair } from '../../shared/sources/binance';
import type { Candle } from '../../shared/types';
import { fetchJson } from '../../shared/http';
import { parseNumericRows } from '../../shared/validate';

/** Binance's spot market opened in mid-2017; nothing is older. */
export const HISTORY_START = Date.UTC(2017, 6, 1);
const PAGE = 1000;
const DAY = 86_400_000;

/**
 * Every daily candle Binance has for SYMBOL/USDT, oldest first, paging
 * forward 1,000 days at a time from HISTORY_START (about 4 requests for the
 * oldest coins). Returns null when there's no pair, or when the latest close
 * is more than 10% from `refPrice` (the same ticker for a different coin).
 */
export async function fullHistory(fetchFn: FetchFn, symbol: string, refPrice: number, now: number): Promise<Candle[] | null> {
  if (!hasUsdtPair(symbol)) return null;
  const out: Candle[] = [];
  let start = HISTORY_START;
  for (let page = 0; page < 10 && start < now; page++) {
    const raw = await fetchJson(fetchFn, `${BINANCE_BASE}/klines?symbol=${symbol}USDT&interval=1d&startTime=${start}&limit=${PAGE}`, { retries: 2 });
    const rows = parseNumericRows(raw, 6, 'Binance klines').map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v }));
    if (rows.length === 0) break;
    out.push(...rows);
    if (rows.length < PAGE) break;
    start = rows[rows.length - 1].t + DAY;
  }
  const clean = cleanCandles(out);
  if (clean.length < 10) return null;
  const last = clean[clean.length - 1].c;
  if (Math.abs(last - refPrice) / refPrice > 0.1) return null;
  return clean;
}
