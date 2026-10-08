import { describe, expect, it } from 'vitest';
import { DAY, dayKey, readings, type Reading } from '../../shared/backtest';
import type { Metrics } from '../../shared/signals';
import type { Candle } from '../../shared/types';
import type { CoinDay, CoinInput } from '../research/compare';
import { LIVE_WEIGHTS, scoreWith } from '../research/deeper';
import {
  parseStablecoins,
  phase7,
  phase7Markdown,
  stablecoinSupply,
  STABLECOINS_URL,
  supplyChange30,
  verdict,
  volumePercentiles,
  volumeReading,
} from '../research/phase7';
import { mockFetch } from '../helpers/mockFetch';

const day = (volumeRatio: number | null, return7d: number | null, signals: Partial<Reading['signals']> = {}): CoinDay => ({
  id: 'x',
  ret30: null,
  funding7: null,
  r: {
    t: 0,
    metrics: { volumeRatio, return7d } as Metrics,
    signals: { trend: 1, strength: 0, rsi: 0, volume: 0, ...signals },
    label: null,
    score: null,
    agreement: null,
    returns: { 7: null, 30: null },
  },
});

describe('volume variants', () => {
  it('reads volume as now, graded, as a surprise, and as accumulation / distribution', () => {
    expect(volumeReading(day(1.5, -4), 'current', null)).toBe(-1);
    expect(volumeReading(day(1.2, -4), 'current', null)).toBe(0);
    expect(volumeReading(day(1.3, 4), 'graded', null)).toBeCloseTo(0.5, 10);
    expect(volumeReading(day(2, -4), 'graded', null)).toBe(-1);
    expect(volumeReading(day(0.7, 4), 'graded', null)).toBe(0);
    expect(volumeReading(day(1, 4), 'surprise80', 85)).toBe(1);
    expect(volumeReading(day(1, 4), 'surprise90', 85)).toBe(0);
    expect(volumeReading(day(1, 4), 'surprise90', null)).toBeNull();
    // Heavy volume, flat price: accumulation. Rising on fading volume: distribution.
    expect(volumeReading(day(1.5, -2), 'accdist', null)).toBe(1);
    expect(volumeReading(day(0.7, 8), 'accdist', null)).toBe(-1);
    expect(volumeReading(day(1.5, -6), 'accdist', null)).toBe(-1);
    expect(volumeReading(day(1, 8), 'accdist', null)).toBe(0);
    expect(volumeReading(day(null, 8), 'graded', null)).toBeNull();
  });

  it('ranks the 7-day average volume against the previous 180 days', () => {
    const candles: Candle[] = Array.from({ length: 200 }, (_, i) => ({ t: i * DAY, o: 1, h: 1, l: 1, c: 1, v: i < 193 ? 100 + (i % 5) : 1000 }));
    const p = volumePercentiles(candles);
    expect(p.has(dayKey(185 * DAY))).toBe(false);
    expect(p.get(dayKey(186 * DAY))).toBeGreaterThanOrEqual(0);
    // The last week traded ten times more than ever before.
    expect(p.get(dayKey(199 * DAY))).toBe(100);
  });
});

describe('stablecoin supply', () => {
  const rows = [
    { date: String(Date.UTC(2024, 0, 1) / 1000), totalCirculatingUSD: { peggedUSD: 100, peggedEUR: 10 } },
    { date: Date.UTC(2024, 0, 31) / 1000, totalCirculatingUSD: { peggedUSD: 120, peggedEUR: 1 } },
    { date: 'bad', totalCirculatingUSD: { peggedUSD: 5 } },
    { date: Date.UTC(2024, 1, 1) / 1000 },
  ];

  it('sums every peg per day, and measures the 30-day change', () => {
    const s = parseStablecoins(rows);
    expect(s.size).toBe(2);
    const d = dayKey(Date.UTC(2024, 0, 31));
    expect(s.get(d)).toBe(121);
    expect(supplyChange30(s, d)).toBeCloseTo(10, 10);
    expect(supplyChange30(s, d + 1)).toBeNull();
    expect(() => parseStablecoins({})).toThrow();
  });

  it('downloads from DefiLlama', async () => {
    const f = mockFetch({ [STABLECOINS_URL]: () => rows });
    expect((await stablecoinSupply(f)).size).toBe(2);
  });

  it('adds a fifth check to the score without changing which coin-days are rated', () => {
    const d = day(1, 1, { trend: 1, strength: -1 });
    expect(scoreWith(d, LIVE_WEIGHTS, { weight: 15, value: 1 })).toBe(Math.round(((45 - 25 + 15) / 115) * 100));
    expect(scoreWith(d, LIVE_WEIGHTS, { weight: 15, value: null })).toBe(20);
    expect(scoreWith(day(1, 1, { trend: null }), LIVE_WEIGHTS, { weight: 15, value: 1 })).toBeNull();
  });
});

describe('phase7', () => {
  // Twelve coins over 2020–2024 with trends that keep going; stablecoin supply that grows in odd months and shrinks in even ones.
  const coins: CoinInput[] = Array.from({ length: 12 }, (_, k) => {
    const up = k % 2 === 0;
    const candles: Candle[] = Array.from({ length: 1700 }, (_, i) => {
      const p = 100 * Math.exp((up ? 1 : -1) * i * 0.0015 + Math.sin(i / 9 + k) * 0.02 + (((i * 7919 + k) % 13) - 6) / 300);
      return { t: Date.UTC(2020, 0, 1) + i * DAY, o: p, h: p, l: p, c: p, v: 100 + ((i + k) % 7) * 10 + (i % 40 < 5 ? 200 : 0) };
    });
    const id = k === 0 ? 'bitcoin' : `c${k}`;
    return { id, candles, readings: readings(id, candles, null, null) };
  });
  const supply = new Map(Array.from({ length: 1800 }, (_, i) => [dayKey(Date.UTC(2020, 0, 1)) + i, 1e9 * (1 + 0.3 * Math.sin(i / 25))]));

  it('tests every variant and picks on the tuning years', () => {
    const p = phase7(coins, supply);
    expect(p.volume.keys).toHaveLength(5);
    expect(p.volume.keys).toContain(p.volume.picked);
    expect(p.supply.timing).toEqual(['supply-timing-0', 'supply-timing-1', 'supply-timing-2']);
    expect(p.supply.timing).toContain(p.supply.picked);
    expect(p.supply.check).toBe('supply-check');
    // The unchanged volume reading reproduces the current rules exactly.
    expect(p.ev.byYear['volume-current'].heldout).toEqual(p.ev.byYear.current.heldout);
    const md = phase7Markdown(p);
    expect(md).toContain('## Volume variants (Phase 7, Step 2), next 30 days');
    expect(md).toContain('← picked');
    expect(md).toContain('Fifth check: **');
  });

  it('a rule identical to the current rules fails: it isn’t better', () => {
    const p = phase7(coins, null);
    const v = verdict(p.ev, 'volume-current');
    expect(v.pass).toBe(false);
    expect(v.why).toContain('not above the current rules');
    expect(phase7Markdown(p)).toContain('couldn’t be downloaded');
  });
});
