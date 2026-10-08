import { inflateRawSync } from 'node:zlib';
import { dayKey } from '../../shared/backtest';
import type { FetchFn } from '../../shared/http';

/**
 * Perpetual-futures funding rates from Binance's public data archive
 * (data.binance.vision), one zipped CSV per symbol per month. The live futures
 * API (fapi.binance.com) refuses US addresses, including GitHub's runners; the
 * archive doesn't. Used by the backtest only (PLAN.md §5, Phase 5, Step 5).
 */
export const FUNDING_BASE = 'https://data.binance.vision/data/futures/um/monthly/fundingRate';
/** Binance's USDⓈ-M perpetuals started in September 2019. */
export const FUNDING_START = Date.UTC(2019, 8, 1);

/** The one file inside a zip archive (via the central directory, so streamed entries work too). */
export function unzipSingle(zip: Uint8Array): Uint8Array {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65_535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('zip: no end-of-directory record');
  const cd = view.getUint32(eocd + 16, true);
  if (view.getUint32(cd, true) !== 0x02014b50) throw new Error('zip: bad central directory');
  const method = view.getUint16(cd + 10, true);
  const size = view.getUint32(cd + 20, true);
  const local = view.getUint32(cd + 42, true);
  if (view.getUint32(local, true) !== 0x04034b50) throw new Error('zip: bad local header');
  const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  const data = zip.subarray(start, start + size);
  if (method === 0) return data;
  if (method === 8) return inflateRawSync(data);
  throw new Error(`zip: unsupported compression ${method}`);
}

/** Rows of (time ms, rate) from the archive's CSV, with or without a header line. */
export function parseFundingCsv(csv: string): { t: number; rate: number }[] {
  const lines = csv.trim().split(/\r?\n/);
  let timeCol = 0;
  let rateCol = 2;
  if (lines.length && /[a-z]/i.test(lines[0])) {
    const head = lines.shift()!.split(',').map((h) => h.trim().toLowerCase());
    timeCol = Math.max(0, head.findIndex((h) => h.includes('time')));
    rateCol = head.findIndex((h) => h.includes('rate'));
    if (rateCol < 0) throw new Error(`funding CSV: no rate column in ${head.join(',')}`);
  }
  const out: { t: number; rate: number }[] = [];
  for (const line of lines) {
    const cols = line.split(',');
    const t = Number(cols[timeCol]);
    const rate = Number(cols[rateCol]);
    if (Number.isFinite(t) && t > 0 && Number.isFinite(rate) && Math.abs(rate) < 0.05) out.push({ t, rate });
  }
  return out;
}

/** Each day's average funding rate (per funding period, usually 8 hours), by day key. */
export function dailyFunding(rows: { t: number; rate: number }[]): Map<number, number> {
  const sums = new Map<number, { s: number; n: number }>();
  for (const r of rows) {
    const d = dayKey(r.t);
    const x = sums.get(d) ?? { s: 0, n: 0 };
    x.s += r.rate;
    x.n++;
    sums.set(d, x);
  }
  return new Map([...sums].map(([d, x]) => [d, x.s / x.n]));
}

/** "2021-03" for every month from `from` up to (not including) the month of `now`. */
export function months(from: number, now: number): string[] {
  const out: string[] = [];
  const d = new Date(from);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  const end = new Date(now);
  while (y < end.getUTCFullYear() || (y === end.getUTCFullYear() && m < end.getUTCMonth())) {
    out.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    if (++m === 12) (m = 0), y++;
  }
  return out;
}

/**
 * Daily funding for SYMBOL/USDT perpetuals from `from` (or FUNDING_START) to
 * the last complete month; null when Binance never listed one. Months before
 * the contract existed answer 404 and are skipped.
 */
export async function fundingHistory(fetchFn: FetchFn, symbol: string, from: number, now: number): Promise<Map<number, number> | null> {
  const rows: { t: number; rate: number }[] = [];
  for (const month of months(Math.max(from, FUNDING_START), now)) {
    const pair = `${symbol}USDT`;
    const res = await fetchFn(`${FUNDING_BASE}/${pair}/${pair}-fundingRate-${month}.zip`);
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`funding ${pair} ${month}: HTTP ${res.status}`);
    const csv = new TextDecoder().decode(unzipSingle(new Uint8Array(await res.arrayBuffer())));
    rows.push(...parseFundingCsv(csv));
  }
  return rows.length ? dailyFunding(rows) : null;
}
