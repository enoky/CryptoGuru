import { describe, expect, it } from 'vitest';
import {
  avgReturn,
  completedDays,
  DAY,
  dayKey,
  emptyResult,
  pctFell,
  pctRose,
  readings,
  tally,
  WARMUP_DAYS,
  WINDOW_DAYS,
} from '../../shared/backtest';
import { classify, computeMetrics, INDICATORS } from '../../shared/signals';
import type { Candle } from '../../shared/types';

const T0 = 1_600_000_000_000 - (1_600_000_000_000 % DAY);

const candles = (closes: number[], volume: (i: number) => number = () => 100): Candle[] =>
  closes.map((c, i) => ({ t: T0 + i * DAY, o: c, h: c, l: c, c, v: volume(i) }));

/** Deterministic random walk (seeded LCG) so results are reproducible. */
function walk(n: number, seed = 42, drift = 0.0005, vol = 0.03): number[] {
  let s = seed;
  const rand = () => ((s = (s * 1_664_525 + 1_013_904_223) % 2 ** 32) / 2 ** 32) - 0.5;
  const out = [100];
  for (let i = 1; i < n; i++) out.push(out[i - 1] * Math.exp(drift + vol * rand() * 2));
  return out;
}

describe('readings', () => {
  const daily = candles(walk(400), (i) => 100 + (i % 9) * 20);
  const fg = new Map(daily.map((c, i) => [dayKey(c.t), (i * 7) % 100]));
  const rs = readings(daily, fg);

  it('starts after the warm-up and stops when no future price is left', () => {
    expect(rs[0].t).toBe(daily[WARMUP_DAYS - 1].t);
    expect(rs.at(-1)!.t).toBe(daily[daily.length - 1 - 7].t);
    expect(rs.at(-1)!.returns[30]).toBeNull();
    expect(rs.at(-1)!.returns[7]).not.toBeNull();
  });

  it('uses exactly the live rules on the trailing 365-day window', () => {
    const i = 380 - 7; // a day late enough to use the full window
    const r = rs.find((x) => x.t === daily[i].t)!;
    const window = daily.slice(i - WINDOW_DAYS + 1, i + 1);
    const m = computeMetrics(window, fg.get(dayKey(daily[i].t))!, daily[i].t + DAY)!;
    expect(r.signals).toEqual(classify(m));
    expect(r.returns[7]).toBeCloseTo(daily[i + 7].c / daily[i].c - 1, 12);
  });

  it('never looks ahead: changing later prices leaves earlier readings alone', () => {
    const changed = daily.map((c, i) => (i > 300 ? { ...c, c: c.c * 3, v: c.v * 10 } : c));
    const after = readings(changed, fg);
    const k = rs.findIndex((x) => x.t === daily[300].t);
    expect(after[k].signals).toEqual(rs[k].signals);
    expect(after[k].label).toEqual(rs[k].label);
  });
});

describe('tally', () => {
  it('counts every coin-day once per indicator and per label', () => {
    const daily = candles(walk(500, 7));
    const res = tally(emptyResult(), 'x', readings(daily, null));
    for (const h of [7, 30] as const) {
      const r = res.horizons[h];
      for (const i of INDICATORS) {
        const t = r.indicators[i.key];
        const total = t.bullish.n + t.bearish.n + t.neutral.n;
        // Fear & Greed was not supplied, so market mood never counts; everything else always has data.
        expect(total).toBe(i.key === 'mood' ? 0 : r.baseline.n);
      }
      expect(Object.values(r.labels).reduce((a, t) => a + t.n, 0)).toBe(r.baseline.n);
    }
  });

  it('a market that only rises was higher 100% of the time', () => {
    const daily = candles(Array.from({ length: 300 }, (_, i) => 100 * 1.01 ** i));
    const r = tally(emptyResult(), 'up', readings(daily, null)).horizons[30];
    expect(pctRose(r.baseline)).toBe(100);
    expect(pctFell(r.baseline)).toBe(0);
    expect(avgReturn(r.baseline)).toBeCloseTo((1.01 ** 30 - 1) * 100, 6);
    expect(r.indicators.trend.bullish.n).toBe(r.baseline.n);
  });

  it('merges several coins and tracks the date range', () => {
    const a = candles(walk(300, 1));
    const b = candles(walk(320, 2));
    const res = tally(tally(emptyResult(), 'a', readings(a, null)), 'b', readings(b, null));
    expect(res.coins).toEqual(['a', 'b']);
    expect(res.from).toBe(a[WARMUP_DAYS - 1].t);
    expect(res.horizons[7].baseline.n).toBe(300 - WARMUP_DAYS + 1 - 7 + (320 - WARMUP_DAYS + 1 - 7));
  });

  it('skips coins with too little history', () => {
    expect(tally(emptyResult(), 'young', readings(candles(walk(150)), null)).coins).toEqual([]);
  });

  /**
   * Fixed dataset, fixed result: if a change to the rules or the engine moves
   * these numbers, the published backtest changes too, so it should be deliberate.
   */
  it('reproduces the reference result', () => {
    const coins = [11, 22, 33].map((seed) => candles(walk(900, seed, 0.0004, 0.035), (i) => 1000 + ((i * seed) % 37) * 40));
    const fg = new Map(coins[0].map((c, i) => [dayKey(c.t), Math.round(50 + 45 * Math.sin(i / 20))]));
    let res = emptyResult();
    coins.forEach((c, k) => (res = tally(res, `c${k}`, readings(c, fg))));
    const h = res.horizons[30];
    const summary = {
      baseline: [h.baseline.n, pctRose(h.baseline)!.toFixed(1)],
      trendBullish: [h.indicators.trend.bullish.n, pctRose(h.indicators.trend.bullish)!.toFixed(1)],
      rsiOversold: [h.indicators.rsi.bullish.n, pctRose(h.indicators.rsi.bullish)!.toFixed(1)],
      moodFear: [h.indicators.mood.bullish.n, pctRose(h.indicators.mood.bullish)!.toFixed(1)],
      strongBullish: [h.labels['Strong bullish signals'].n],
      strongBearish: [h.labels['Strong bearish signals'].n],
    };
    expect(summary).toMatchInlineSnapshot(`
      {
        "baseline": [
          2013,
          "63.9",
        ],
        "moodFear": [
          714,
          "64.3",
        ],
        "rsiOversold": [
          52,
          "65.4",
        ],
        "strongBearish": [
          87,
        ],
        "strongBullish": [
          347,
        ],
        "trendBullish": [
          1354,
          "65.2",
        ],
      }
    `);
  });
});

describe('completedDays', () => {
  it('drops the still-open daily candle', () => {
    const daily = candles([1, 2, 3]);
    expect(completedDays(daily, daily[2].t + DAY / 2)).toHaveLength(2);
    expect(completedDays(daily, daily[2].t + DAY)).toHaveLength(3);
  });
});
