import { describe, expect, it } from 'vitest';
import { DAY, readings, type Reading } from '../../shared/backtest';
import type { Metrics } from '../../shared/signals';
import type { Candle } from '../../shared/types';
import type { CoinDay, CoinInput } from '../research/compare';
import { bootstrap, deeper, deeperMarkdown, fitLogistic, LIVE_WEIGHTS, pooled, scoreWith, yearly } from '../research/deeper';

/** Deterministic pseudo-random numbers for synthetic data. */
function lcg(seed: number) {
  let s = seed;
  return () => ((s = (s * 1_664_525 + 1_013_904_223) % 2 ** 32) / 2 ** 32);
}

describe('fitLogistic', () => {
  it('recovers known weights from simulated data', () => {
    const rand = lcg(7);
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < 20_000; i++) {
      const x = [rand() * 2 - 1, rand() * 2 - 1];
      const p = 1 / (1 + Math.exp(-(0.5 + 2 * x[0] - 1 * x[1])));
      X.push(x);
      y.push(rand() < p ? 1 : 0);
    }
    const b = fitLogistic(X, y, 0);
    // Within sampling noise of the true 0.5, 2 and −1.
    expect(Math.abs(b[0] - 0.5)).toBeLessThan(0.15);
    expect(Math.abs(b[1] - 2)).toBeLessThan(0.15);
    expect(Math.abs(b[2] + 1)).toBeLessThan(0.15);
  });
});

describe('scoreWith', () => {
  it('reproduces the live score with the live weights', () => {
    const candles: Candle[] = Array.from({ length: 500 }, (_, i) => {
      const p = 100 * Math.exp(Math.sin(i / 30) * 0.4 + i * 0.001 + (((i * 7919) % 13) - 6) / 400);
      return { t: Date.UTC(2021, 0, 1) + i * DAY, o: p, h: p, l: p, c: p, v: 100 + (i % 9) * 10 };
    });
    const rs = readings('x', candles, null, null);
    let checked = 0;
    for (const r of rs) {
      const day: CoinDay = { id: 'x', r, ret30: null, funding7: null };
      expect(scoreWith(day, LIVE_WEIGHTS)).toBe(r.score);
      checked++;
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('leaves a check out when its weight is 0, and needs two checks with data', () => {
    const day = (signals: Reading['signals']): CoinDay => ({
      id: 'x',
      ret30: null,
      funding7: null,
      r: { t: 0, metrics: {} as Metrics, signals, label: null, score: null, agreement: null, returns: { 7: null, 30: null } },
    });
    const d = day({ trend: 1, strength: -1, rsi: 0, volume: 0 });
    expect(scoreWith(d, LIVE_WEIGHTS)).toBe(20); // (45 − 25) / 100
    expect(scoreWith(d, { ...LIVE_WEIGHTS, strength: 0 })).toBe(60); // 45 / 75
    expect(scoreWith(day({ trend: 1, strength: null, rsi: null, volume: null }), LIVE_WEIGHTS)).toBeNull();
    expect(scoreWith(day({ trend: null, strength: 1, rsi: 1, volume: 1 }), LIVE_WEIGHTS)).toBeNull();
  });
});

describe('bootstrap', () => {
  it('is repeatable and brackets the mean', () => {
    const blocks = Array.from({ length: 40 }, (_, i) => i);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const a = bootstrap(blocks, mean)!;
    expect(bootstrap(blocks, mean)).toEqual(a);
    expect(a[0]).toBeLessThan(19.5);
    expect(a[1]).toBeGreaterThan(19.5);
    expect(bootstrap([1], mean)).toBeNull();
  });
});

describe('deeper', () => {
  // Twelve coins over 2020–2024; even coins trend up and keep rising, odd coins trend down and keep falling.
  const coins: CoinInput[] = Array.from({ length: 12 }, (_, k) => {
    const up = k % 2 === 0;
    const candles: Candle[] = Array.from({ length: 1700 }, (_, i) => {
      const p = 100 * Math.exp((up ? 1 : -1) * i * 0.0015 + Math.sin(i / 9 + k) * 0.02 + (((i * 7919 + k) % 13) - 6) / 300);
      return { t: Date.UTC(2020, 0, 1) + i * DAY, o: p, h: p, l: p, c: p, v: 100 + ((i + k) % 7) * 10 };
    });
    return { id: k === 0 ? 'bitcoin' : `c${k}`, candles, readings: readings(k === 0 ? 'bitcoin' : `c${k}`, candles, null, null) };
  });
  const d = deeper(coins);

  it('learns a positive trend weight when trends kept going', () => {
    expect(d.weights.learnedAbs.trend).toBeGreaterThan(0);
    expect(Object.values(d.weights.live).reduce((a, b) => a + Math.abs(b), 0)).toBeCloseTo(100, 6);
  });

  it('keeps tuning and held-out years apart, and scores the current rules', () => {
    expect([...(d.byYear.current.tuning.keys())].every((y) => y <= 2022)).toBe(true);
    expect([...(d.byYear.current.heldout.keys())].every((y) => y >= 2023)).toBe(true);
    expect(yearly(d, 'current', 'heldout', 'abs').mean!).toBeGreaterThan(0);
    const p = pooled(d, 'learnedAbs', 'heldout', 'abs');
    expect(p.value).not.toBeNull();
    expect(p.ci).not.toBeNull();
  });

  it('writes the report sections', () => {
    const md = deeperMarkdown(d);
    for (const h of ['## Learned weights (Phase 6)', '## Which checks matter? (ablation, next 30 days)', '## Ratings in detail, held-out years (next 30 days)', '**Any coin-day (yardstick)**']) {
      expect(md).toContain(h);
    }
  });
});
