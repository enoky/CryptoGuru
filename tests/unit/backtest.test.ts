import { describe, expect, it } from 'vitest';
import {
  avgReturn,
  completedDays,
  contextFor,
  AGREEMENTS,
  DAY,
  dayKey,
  emptyResult,
  marketHistory,
  pctFell,
  pctRight,
  pctRose,
  readings,
  tally,
  WARMUP_DAYS,
  WINDOW_DAYS,
} from '../../shared/backtest';
import { classify, combine, computeMetrics, GROUPS } from '../../shared/signals';
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

describe('marketHistory', () => {
  it('gives Bitcoin’s 90-day return for each day', () => {
    const btc = candles(Array.from({ length: 120 }, (_, i) => 100 + i));
    const m = marketHistory([{ id: 'bitcoin', candles: btc }]);
    expect(m.get(dayKey(btc[89].t))?.btcReturn90d ?? null).toBeNull();
    expect(m.get(dayKey(btc[100].t))!.btcReturn90d).toBeCloseTo((200 / 110 - 1) * 100, 10);
  });

  it('measures breadth over coins with 200 days of history, once at least 10 have it', () => {
    const coins = Array.from({ length: 12 }, (_, k) => ({
      id: `c${k}`,
      // Three coins fall, the rest rise; c11 starts 50 days late.
      candles: candles(Array.from({ length: k === 11 ? 250 : 300 }, (_, i) => (k < 3 ? 1000 - i : 100 + i))).map((c) =>
        k === 11 ? { ...c, t: c.t + 50 * DAY } : c,
      ),
    }));
    const m = marketHistory(coins);
    expect(m.get(dayKey(coins[0].candles[198].t))?.breadth ?? null).toBeNull();
    // Day 199: 11 coins have 200 days (c11 doesn't yet), 8 of them above their average.
    expect(m.get(dayKey(coins[0].candles[199].t))!.breadth).toBe(Math.round((8 / 11) * 100));
    // Day 249: c11 has joined.
    expect(m.get(dayKey(coins[0].candles[249].t))!.breadth).toBe(Math.round((9 / 12) * 100));
  });

  it('gives Bitcoin no strength against itself', () => {
    const m = new Map([[5, { btcReturn90d: 12, breadth: 40 }]]);
    expect(contextFor('bitcoin', 5 * DAY, m, null)).toEqual({ fearGreed: null, btcReturn90d: null, breadth: 40 });
    expect(contextFor('ethereum', 5 * DAY, m, new Map([[5, 70]]))).toEqual({ fearGreed: 70, btcReturn90d: 12, breadth: 40 });
  });
});

describe('readings', () => {
  const daily = candles(walk(400), (i) => 100 + (i % 9) * 20);
  const btc = candles(walk(400, 9));
  const market = marketHistory([{ id: 'bitcoin', candles: btc }]);
  const fg = new Map(daily.map((c, i) => [dayKey(c.t), (i * 7) % 100]));
  const rs = readings('coin', daily, market, fg);

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
    const m = computeMetrics(window, contextFor('coin', daily[i].t, market, fg), daily[i].t + DAY)!;
    expect(m.btcReturn90d).not.toBeNull();
    expect(r.signals).toEqual(classify(m).signals);
    expect(r.agreement).toBe(combine(classify(m).signals, m)!.agreement);
    expect(r.returns[7]).toBeCloseTo(daily[i + 7].c / daily[i].c - 1, 12);
  });

  it('never looks ahead: changing later prices leaves earlier readings alone', () => {
    const changed = daily.map((c, i) => (i > 300 ? { ...c, c: c.c * 3, v: c.v * 10 } : c));
    const after = readings('coin', changed, market, fg);
    const k = rs.findIndex((x) => x.t === daily[300].t);
    expect(after[k].signals).toEqual(rs[k].signals);
    expect(after[k].label).toEqual(rs[k].label);
  });
});

describe('tally', () => {
  it('counts every coin-day once per group and per label, and each directional rating once by agreement', () => {
    const daily = candles(walk(500, 7));
    const rs = readings('x', daily, null, null);
    const res = tally(emptyResult(), 'x', rs);
    for (const h of [7, 30] as const) {
      const r = res.horizons[h];
      for (const g of GROUPS) {
        const t = r.groups[g.key];
        const total = t.bullish.n + t.bearish.n + t.neutral.n;
        // No Bitcoin history was supplied, so strength never counts; everything else always has data.
        expect(total).toBe(g.key === 'strength' ? 0 : r.baseline.n);
      }
      expect(Object.values(r.labels).reduce((a, t) => a + t.n, 0)).toBe(r.baseline.n);
      const directional = rs.filter((x) => x.returns[h] != null && x.label && !x.label.startsWith('Mixed')).length;
      expect(AGREEMENTS.reduce((a, c) => a + r.calls[c].n, 0)).toBe(directional);
    }
  });

  it('counts a call as right when the price moved the way the rating leaned', () => {
    const r = tally(emptyResult(), 'x', [
      { t: 0, metrics: {} as never, signals: {} as never, label: 'Leaning bullish', agreement: 'High', returns: { 7: 0.1, 30: null } },
      { t: 1, metrics: {} as never, signals: {} as never, label: 'Strong bearish signals', agreement: 'High', returns: { 7: 0.1, 30: null } },
      { t: 2, metrics: {} as never, signals: {} as never, label: 'Leaning bearish', agreement: 'Low', returns: { 7: -0.1, 30: null } },
    ]).horizons[7];
    expect(r.calls.High).toEqual({ n: 2, right: 1 });
    expect(pctRight(r.calls.Low)).toBe(100);
    expect(pctRight(r.calls.Medium)).toBeNull();
  });

  it('a market that only rises was higher 100% of the time', () => {
    const daily = candles(Array.from({ length: 300 }, (_, i) => 100 * 1.01 ** i));
    const r = tally(emptyResult(), 'up', readings('up', daily, null, null)).horizons[30];
    expect(pctRose(r.baseline)).toBe(100);
    expect(pctFell(r.baseline)).toBe(0);
    expect(avgReturn(r.baseline)).toBeCloseTo((1.01 ** 30 - 1) * 100, 6);
    expect(r.groups.trend.bullish.n).toBe(r.baseline.n);
  });

  it('merges several coins and tracks the date range', () => {
    const a = candles(walk(300, 1));
    const b = candles(walk(320, 2));
    const res = tally(tally(emptyResult(), 'a', readings('a', a, null, null)), 'b', readings('b', b, null, null));
    expect(res.coins).toEqual(['a', 'b']);
    expect(res.from).toBe(a[WARMUP_DAYS - 1].t);
    expect(res.horizons[7].baseline.n).toBe(300 - WARMUP_DAYS + 1 - 7 + (320 - WARMUP_DAYS + 1 - 7));
  });

  it('skips coins with too little history', () => {
    expect(tally(emptyResult(), 'young', readings('young', candles(walk(150)), null, null)).coins).toEqual([]);
  });

  /**
   * Fixed dataset, fixed result: if a change to the rules or the engine moves
   * these numbers, the published backtest changes too, so it should be deliberate.
   */
  it('reproduces the reference result', () => {
    const coins = [11, 22, 33].map((seed) => candles(walk(900, seed, 0.0004, 0.035), (i) => 1000 + ((i * seed) % 37) * 40));
    const ids = ['bitcoin', 'c1', 'c2'];
    const fg = new Map(coins[0].map((c, i) => [dayKey(c.t), Math.round(50 + 45 * Math.sin(i / 20))]));
    const market = marketHistory(coins.map((candles, k) => ({ id: ids[k], candles })));
    let res = emptyResult();
    coins.forEach((c, k) => (res = tally(res, ids[k], readings(ids[k], c, market, fg))));
    const h = res.horizons[30];
    const summary = {
      baseline: [h.baseline.n, pctRose(h.baseline)!.toFixed(1)],
      trendBullish: [h.groups.trend.bullish.n, pctRose(h.groups.trend.bullish)!.toFixed(1)],
      strengthBullish: [h.groups.strength.bullish.n, pctRose(h.groups.strength.bullish)!.toFixed(1)],
      rsiBullish: [h.groups.rsi.bullish.n, pctRose(h.groups.rsi.bullish)!.toFixed(1)],
      strongBullish: [h.labels['Strong bullish signals'].n],
      strongBearish: [h.labels['Strong bearish signals'].n],
      highAgreementRight: [h.calls.High.n, pctRight(h.calls.High)!.toFixed(1)],
    };
    expect(summary).toMatchInlineSnapshot(`
      {
        "baseline": [
          2013,
          "63.9",
        ],
        "highAgreementRight": [
          1,
          "100.0",
        ],
        "rsiBullish": [
          9,
          "88.9",
        ],
        "strengthBullish": [
          180,
          "57.2",
        ],
        "strongBearish": [
          108,
        ],
        "strongBullish": [
          152,
        ],
        "trendBullish": [
          1100,
          "68.1",
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
