import { describe, expect, it } from 'vitest';
import { DAY, dayKey, type Reading } from '../../shared/backtest';
import type { Metrics } from '../../shared/signals';
import { FUNDING_LEVELS, funding7, RULES, type CoinDay } from '../research/compare';
import { dailyFunding, FUNDING_BASE, FUNDING_START, fundingHistory, months, parseFundingCsv, unzipSingle } from '../research/funding';
import { zip } from '../helpers/zip';
import { mockFetch } from '../helpers/mockFetch';

const T = Date.UTC(2021, 2, 1);
const CSV = `calc_time,funding_interval_hours,last_funding_rate\n${T},8,0.0001\n${T + 8 * 3600_000},8,0.0003\n${T + DAY},8,-0.0002\n`;

describe('reading the funding archive', () => {
  it('unzips a deflated single-file archive', () => {
    expect(new TextDecoder().decode(unzipSingle(zip('BTCUSDT-fundingRate-2021-03.csv', CSV)))).toBe(CSV);
  });

  it('parses the CSV with or without a header, and averages each day', () => {
    const rows = parseFundingCsv(CSV);
    expect(rows).toEqual([
      { t: T, rate: 0.0001 },
      { t: T + 8 * 3600_000, rate: 0.0003 },
      { t: T + DAY, rate: -0.0002 },
    ]);
    expect(parseFundingCsv(`${T},8,0.0001`)).toEqual([{ t: T, rate: 0.0001 }]);
    const daily = dailyFunding(rows);
    expect(daily.get(dayKey(T))).toBeCloseTo(0.0002, 12);
    expect(daily.get(dayKey(T + DAY))).toBe(-0.0002);
  });

  it('lists every complete month up to now', () => {
    expect(months(Date.UTC(2020, 10, 15), Date.UTC(2021, 1, 3))).toEqual(['2020-11', '2020-12', '2021-01']);
  });

  it('downloads month by month from the later of the listing and September 2019, skipping months before the contract', async () => {
    const f = mockFetch({
      [FUNDING_BASE]: (u) => (u.includes('2021-03') ? new Response(Buffer.from(zip('x.csv', CSV))) : 404),
    });
    const daily = (await fundingHistory(f, 'BTC', Date.UTC(2017, 0, 1), Date.UTC(2021, 4, 2)))!;
    expect(f.calls[0]).toBe(`${FUNDING_BASE}/BTCUSDT/BTCUSDT-fundingRate-2019-09.zip`);
    expect(f.calls).toHaveLength(months(FUNDING_START, Date.UTC(2021, 4, 2)).length);
    expect(daily.size).toBe(2);
  });

  it('is null for a coin that never had a contract', async () => {
    expect(await fundingHistory(mockFetch({ [FUNDING_BASE]: () => 404 }), 'XYZ', T, Date.UTC(2021, 5, 1))).toBeNull();
  });
});

describe('funding rules', () => {
  it('averages the last 7 days, from at least 5', () => {
    const d = 1000;
    const daily = new Map([996, 997, 998, 999, 1000].map((k) => [k, k === 1000 ? 0.0006 : 0.0001]));
    expect(funding7(daily, d)).toBeCloseTo(0.0002, 12);
    daily.delete(996);
    expect(funding7(daily, d)).toBeNull();
    expect(funding7(undefined, d)).toBeNull();
  });

  const day = (label: Reading['label'], f: number | null): CoinDay => ({
    id: 'x',
    ret30: null,
    funding7: f,
    r: { t: 0, metrics: {} as Metrics, signals: {} as never, label, score: 0, agreement: null, returns: { 7: 0, 30: 0 } },
  });
  const rule = (key: string) => RULES.find((r) => r.key === key)!;

  it('reads crowded longs as down and crowded shorts as up', () => {
    const r = rule('funding0'); // above 0.02% / below 0
    expect(FUNDING_LEVELS[0]).toEqual({ high: 0.0002, low: 0 });
    expect(r.dir(day(null, 0.0005), undefined)).toBe(-1);
    expect(r.dir(day(null, -0.0001), undefined)).toBe(1);
    expect(r.dir(day(null, 0.0001), undefined)).toBe(0);
    expect(r.dir(day(null, null), undefined)).toBeNull();
  });

  it('drops a call when the crowd already leans the same way, and keeps the current rating without funding data', () => {
    const r = rule('fundingFilter0');
    expect(r.dir(day('Uptrend', 0.0005), undefined)).toBe(0);
    expect(r.dir(day('Uptrend', 0.0001), undefined)).toBe(1);
    expect(r.dir(day('Downtrend', -0.0001), undefined)).toBe(0);
    expect(r.dir(day('Downtrend', 0.0005), undefined)).toBe(-1);
    expect(r.dir(day('Uptrend', null), undefined)).toBe(1);
  });
});
