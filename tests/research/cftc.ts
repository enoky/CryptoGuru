import { dayKey } from '../../shared/backtest';
import type { FetchFn } from '../../shared/http';
import { unzipSingle } from './funding';

/**
 * CME Bitcoin futures positioning from the CFTC's weekly Traders in Financial
 * Futures report, futures only (PLAN.md §5, Phase 8). Public domain, keyless.
 * The yearly archives (one zipped CSV per year, the current year updated
 * weekly) are tried first; the public reporting API (Socrata) is the fallback.
 */
export const CFTC_HISTORY = 'https://www.cftc.gov/files/dea/history';
export const CFTC_API = 'https://publicreporting.cftc.gov/resource/gpe5-46if.json';
/** CME Bitcoin futures (5 BTC). Micro and other bitcoin contracts have their own codes and are left out. */
export const BITCOIN_CODE = '133741';
const BITCOIN_NAME = /^BITCOIN - CHICAGO MERCANTILE EXCHANGE/i;
/** CME Bitcoin futures started trading on 17 December 2017. */
export const CFTC_FIRST_YEAR = 2017;

export interface CotReport {
  /** Positions as of this Tuesday (UTC ms). */
  t: number;
  /** First day (day key) the report was public: the Saturday after, since it's released Friday afternoon US time. */
  available: number;
  openInterest: number;
  assetLong: number;
  assetShort: number;
  levLong: number;
  levShort: number;
}

/** "Report_Date_as_YYYY-MM-DD" → "report_date_as_yyyy_mm_dd", so both sources' names match. */
const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** One CSV line, with quoted fields (market names can contain commas). */
export function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') out.push(cur), (cur = '');
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Field lookup by normalised name: exact first, then the first name starting with it (e.g. "…_long" → "…_long_all"). */
function picker(names: string[]) {
  const n = names.map(norm);
  return (want: string) => {
    let i = n.indexOf(want);
    if (i < 0) i = n.findIndex((x) => x.startsWith(want));
    return i;
  };
}

function toReport(get: (want: string) => string | undefined): CotReport | null {
  const code = (get('cftc_contract_market_code') ?? '').trim();
  const name = (get('market_and_exchange_names') ?? '').trim();
  if (code !== BITCOIN_CODE && !BITCOIN_NAME.test(name)) return null;
  const date = (get('report_date_as_yyyy_mm_dd') ?? '').trim().slice(0, 10);
  const t = Date.parse(`${date}T00:00:00Z`);
  const num = (k: string) => Number(String(get(k) ?? '').replace(/,/g, '').trim());
  const r = {
    t,
    available: dayKey(t) + 4,
    openInterest: num('open_interest_all'),
    assetLong: num('asset_mgr_positions_long'),
    assetShort: num('asset_mgr_positions_short'),
    levLong: num('lev_money_positions_long'),
    levShort: num('lev_money_positions_short'),
  };
  return Number.isFinite(t) && r.openInterest > 0 && [r.assetLong, r.assetShort, r.levLong, r.levShort].every(Number.isFinite) ? r : null;
}

/** CME Bitcoin rows from one yearly archive's CSV. */
export function parseCotCsv(csv: string): CotReport[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const col = picker(splitCsv(lines[0]));
  const out: CotReport[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsv(line);
    const r = toReport((k) => {
      const i = col(k);
      return i < 0 ? undefined : cells[i];
    });
    if (r) out.push(r);
  }
  return out;
}

/** CME Bitcoin rows from the public reporting API's JSON. */
export function parseCotJson(rows: unknown): CotReport[] {
  if (!Array.isArray(rows)) throw new Error('CFTC API: expected an array');
  const out: CotReport[] = [];
  for (const row of rows as Record<string, unknown>[]) {
    const keys = Object.keys(row ?? {});
    const col = picker(keys);
    const r = toReport((k) => {
      const i = col(k);
      return i < 0 ? undefined : String(row[keys[i]]);
    });
    if (r) out.push(r);
  }
  return out;
}

const byTime = (rs: CotReport[]) => [...new Map(rs.map((r) => [r.t, r])).values()].sort((a, b) => a.t - b.t);

/** Every weekly CME Bitcoin report from December 2017 to now, oldest first, and where it came from. */
export async function cotHistory(fetchFn: FetchFn, now: number): Promise<{ reports: CotReport[]; source: string }> {
  const errors: string[] = [];
  try {
    const all: CotReport[] = [];
    for (let y = CFTC_FIRST_YEAR; y <= new Date(now).getUTCFullYear(); y++) {
      const res = await fetchFn(`${CFTC_HISTORY}/fut_fin_txt_${y}.zip`);
      if (!res.ok) throw new Error(`fut_fin_txt_${y}.zip: HTTP ${res.status}`);
      all.push(...parseCotCsv(new TextDecoder().decode(unzipSingle(new Uint8Array(await res.arrayBuffer())))));
    }
    if (all.length) return { reports: byTime(all), source: 'CFTC yearly archives' };
    errors.push('archives: no CME Bitcoin rows');
  } catch (e) {
    errors.push(String(e));
  }
  const url = `${CFTC_API}?$limit=5000&$order=report_date_as_yyyy_mm_dd&cftc_contract_market_code=${BITCOIN_CODE}`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`CFTC: ${errors.join('; ')}; API HTTP ${res.status}`);
  const reports = byTime(parseCotJson(await res.json()));
  if (!reports.length) throw new Error(`CFTC: ${errors.join('; ')}; API: no CME Bitcoin rows`);
  return { reports, source: 'CFTC public reporting API' };
}

/** Net position as % of open interest. */
export const assetNet = (r: CotReport) => ((r.assetLong - r.assetShort) / r.openInterest) * 100;
export const levNet = (r: CotReport) => ((r.levLong - r.levShort) / r.openInterest) * 100;

export interface CotDay {
  /** Change in asset managers' net % of open interest over the last 4 reports, points. */
  assetChange4: number | null;
  /** Share (0–100) of the previous 52 reports with a lower leveraged-fund net % than the latest. */
  levPercentile: number | null;
}

/** The latest public report's readings for each day from the first report to `lastDay`. */
export function cotByDay(reports: CotReport[], lastDay: number): Map<number, CotDay> {
  const out = new Map<number, CotDay>();
  if (!reports.length) return out;
  let i = -1;
  for (let d = reports[0].available; d <= lastDay; d++) {
    while (i + 1 < reports.length && reports[i + 1].available <= d) i++;
    if (i < 0) continue;
    const assetChange4 = i >= 4 ? assetNet(reports[i]) - assetNet(reports[i - 4]) : null;
    let levPercentile: number | null = null;
    if (i >= 52) {
      const now = levNet(reports[i]);
      let below = 0;
      for (let j = i - 52; j < i; j++) if (levNet(reports[j]) < now) below++;
      levPercentile = (below / 52) * 100;
    }
    out.set(d, { assetChange4, levPercentile });
  }
  return out;
}
