import { describe, expect, it } from 'vitest';
import { DAY, dayKey, readings } from '../../shared/backtest';
import type { Candle } from '../../shared/types';
import { assetNet, CFTC_API, CFTC_HISTORY, cotByDay, cotHistory, levNet, parseCotCsv, parseCotJson, splitCsv, type CotReport } from '../research/cftc';
import type { CoinInput } from '../research/compare';
import { verdict } from '../research/phase7';
import { phase8, phase8Markdown } from '../research/phase8';
import { mockFetch } from '../helpers/mockFetch';
import { zip } from '../helpers/zip';

const HEADER =
  'Market_and_Exchange_Names,As_of_Date_In_Form_YYMMDD,Report_Date_as_YYYY-MM-DD,CFTC_Contract_Market_Code,Open_Interest_All,Dealer_Positions_Long_All,Dealer_Positions_Short_All,Asset_Mgr_Positions_Long_All,Asset_Mgr_Positions_Short_All,Asset_Mgr_Positions_Spread_All,Lev_Money_Positions_Long_All,Lev_Money_Positions_Short_All';
const row = (name: string, date: string, code: string, oi: number, al: number, as: number, ll: number, ls: number) =>
  `"${name}",000000,${date},${code},${oi},1,1,${al},${as},0,${ll},${ls}`;
const CSV = [
  HEADER,
  row('BITCOIN - CHICAGO MERCANTILE EXCHANGE', '2021-03-02', '133741', 1000, 300, 100, 200, 500),
  row('MICRO BITCOIN - CHICAGO MERCANTILE EXCHANGE', '2021-03-02', '133742', 9000, 1, 1, 1, 1),
  row('U.S. DOLLAR INDEX, ICE FUTURES U.S.', '2021-03-02', '098662', 50, 1, 1, 1, 1),
].join('\r\n');

describe('reading the CFTC report', () => {
  it('splits quoted CSV fields', () => {
    expect(splitCsv('"A, B",1,"say ""hi"""')).toEqual(['A, B', '1', 'say "hi"']);
  });

  it('keeps only CME Bitcoin (5 BTC) rows, as net % of open interest', () => {
    const [r, ...rest] = parseCotCsv(CSV);
    expect(rest).toEqual([]);
    expect(r.t).toBe(Date.UTC(2021, 2, 2));
    // Tuesday's positions are public from the Saturday after.
    expect(r.available).toBe(dayKey(Date.UTC(2021, 2, 6)));
    expect(assetNet(r)).toBeCloseTo(20, 10);
    expect(levNet(r)).toBeCloseTo(-30, 10);
  });

  it('reads the API’s JSON the same way', () => {
    const [r] = parseCotJson([
      {
        market_and_exchange_names: 'BITCOIN - CHICAGO MERCANTILE EXCHANGE',
        report_date_as_yyyy_mm_dd: '2021-03-02T00:00:00.000',
        cftc_contract_market_code: '133741',
        open_interest_all: '1000',
        asset_mgr_positions_long: '300',
        asset_mgr_positions_short: '100',
        lev_money_positions_long: '200',
        lev_money_positions_short: '500',
      },
    ]);
    expect(assetNet(r)).toBeCloseTo(20, 10);
    expect(() => parseCotJson({})).toThrow();
  });

  it('downloads every yearly archive, or falls back to the API', async () => {
    const now = Date.UTC(2018, 5, 1);
    const ok = mockFetch({ [CFTC_HISTORY]: () => new Response(Buffer.from(zip('FinFutYY.txt', CSV))) });
    const a = await cotHistory(ok, now);
    expect(ok.calls).toEqual([`${CFTC_HISTORY}/fut_fin_txt_2017.zip`, `${CFTC_HISTORY}/fut_fin_txt_2018.zip`]);
    expect(a.reports).toHaveLength(1); // the same report in both files counts once
    expect(a.source).toBe('CFTC yearly archives');

    const api = mockFetch({
      [CFTC_HISTORY]: () => 404,
      [CFTC_API]: () => [{ report_date_as_yyyy_mm_dd: '2021-03-02', cftc_contract_market_code: '133741', open_interest_all: '10', asset_mgr_positions_long: '1', asset_mgr_positions_short: '1', lev_money_positions_long: '1', lev_money_positions_short: '1' }],
    });
    expect((await cotHistory(api, now)).source).toBe('CFTC public reporting API');
    await expect(cotHistory(mockFetch({}), now)).rejects.toThrow(/CFTC/);
  });
});

/** Weekly reports from a Tuesday, with asset managers' and leveraged funds' net % set per week. */
const weekly = (n: number, asset: (i: number) => number, lev: (i: number) => number, start = Date.UTC(2019, 0, 1)): CotReport[] =>
  Array.from({ length: n }, (_, i) => {
    const t = start + i * 7 * DAY;
    return { t, available: dayKey(t) + 4, openInterest: 100, assetLong: 50 + asset(i) / 2, assetShort: 50 - asset(i) / 2, levLong: 50 + lev(i) / 2, levShort: 50 - lev(i) / 2 };
  });

describe('cotByDay', () => {
  it('uses the latest report already public, its 4-report change, and its place in the last 52', () => {
    const reports = weekly(60, (i) => i, (i) => (i === 59 ? 100 : i % 10));
    const m = cotByDay(reports, reports[59].available + 3);
    // Before the first report is public there's nothing; the day before report 4 is public, the change isn't known yet.
    expect(m.has(reports[0].available - 1)).toBe(false);
    expect(m.get(reports[4].available - 1)!.assetChange4).toBeNull();
    expect(m.get(reports[4].available)!.assetChange4).toBeCloseTo(4, 10);
    expect(m.get(reports[51].available)!.levPercentile).toBeNull();
    expect(m.get(reports[59].available + 3)!.levPercentile).toBe(100);
  });
});

describe('phase8', () => {
  const coins: CoinInput[] = Array.from({ length: 12 }, (_, k) => {
    const candles: Candle[] = Array.from({ length: 1700 }, (_, i) => {
      const p = 100 * Math.exp((k % 2 ? -1 : 1) * i * 0.0015 + Math.sin(i / 9 + k) * 0.02 + (((i * 7919 + k) % 13) - 6) / 300);
      return { t: Date.UTC(2020, 0, 1) + i * DAY, o: p, h: p, l: p, c: p, v: 100 + ((i + k) % 7) * 10 };
    });
    const id = k === 0 ? 'bitcoin' : `c${k}`;
    return { id, candles, readings: readings(id, candles, null, null) };
  });
  const reports = weekly(300, (i) => 10 * Math.sin(i / 6), (i) => 20 * Math.cos(i / 9), Date.UTC(2019, 0, 1));

  it('tests every candidate, picks the asset-manager level on the tuning years, and writes the report', () => {
    const p = phase8(coins, reports, 'test');
    expect(p.asset).toEqual(['cftc-asset-0', 'cftc-asset-2', 'cftc-asset-5']);
    expect(p.asset).toContain(p.picked);
    expect(p.ev.byYear['cftc-lev']).toBeDefined();
    expect(p.ev.byYear['cftc-check']).toBeDefined();
    const md = phase8Markdown(p);
    expect(md).toContain('## CME futures positioning (Phase 8), next 30 days');
    expect(md).toContain('← picked');
    expect(md).toContain('Fifth check: **');
    expect(md).toContain('at least 1 point above the current rules');
  });

  it('says so when the data couldn’t be downloaded', () => {
    expect(phase8Markdown(phase8(coins, [], 'HTTP 403'))).toContain('couldn’t be downloaded (HTTP 403)');
  });

  it('needs at least 1 point over the current rules', () => {
    const p = phase8(coins, reports, 'test');
    // The current rules can't beat themselves.
    expect(verdict(p.ev, 'current').pass).toBe(false);
  });
});
