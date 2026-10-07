import { describe, expect, it } from 'vitest';
import { emaSeries, macdHistogram, rsi, sma } from '../../shared/indicators';

/** Wilder RSI worked example as published by StockCharts ("RSI" ChartSchool article). */
const RSI_CLOSES = [
  44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64,
  46.21, 46.25, 45.71, 46.45, 45.78, 45.35, 44.03, 44.18, 44.22, 44.57, 43.42, 42.66, 43.13,
];
const RSI_EXPECTED = [70.53, 66.32, 66.55, 69.41, 66.36, 57.97, 62.93, 63.26, 56.06, 62.38, 54.71, 50.42, 39.99, 41.46, 41.87, 45.46, 37.3, 33.08, 37.77];

describe('sma', () => {
  it('averages the last n values', () => {
    expect(sma([1, 2, 3, 4, 5], 2)).toBe(4.5);
    expect(sma([1, 2], 3)).toBeNull();
  });
});

describe('emaSeries', () => {
  it('seeds with the SMA and smooths with k = 2/(n+1)', () => {
    // n = 3 → k = 0.5. Seed = mean(2,4,6) = 4; then 0.5·8 + 0.5·4 = 6; 0.5·10 + 0.5·6 = 8.
    expect(emaSeries([2, 4, 6, 8, 10], 3)).toEqual([4, 6, 8]);
  });
});

describe('rsi (Wilder)', () => {
  it('matches a hand calculation exactly', () => {
    // First 14 changes: gains sum 3.34 → avg 0.238571; losses sum 1.40 → avg 0.1.
    const expected = 100 - 100 / (1 + 0.238571428 / 0.1); // 70.464
    expect(rsi(RSI_CLOSES.slice(0, 15))!).toBeCloseTo(expected, 2);
  });

  it('tracks the published worked example', () => {
    // StockCharts rounds its first averages to 2 decimals (0.24 / 0.10), which
    // puts its values ~0.07 off at first; Wilder smoothing shrinks the gap after that.
    RSI_EXPECTED.forEach((expected, i) => {
      const value = rsi(RSI_CLOSES.slice(0, 15 + i))!;
      expect(Math.abs(value - expected), `RSI #${i + 1}: got ${value.toFixed(3)}, expected ${expected}`).toBeLessThan(0.1);
    });
  });

  it('handles one-way and flat markets', () => {
    expect(rsi([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])).toBe(100);
    expect(rsi(Array(20).fill(5))).toBe(50);
    expect(rsi([1, 2, 3])).toBeNull();
  });
});

describe('macdHistogram', () => {
  /** Straightforward reference: full EMA arrays aligned by index. */
  function referenceHistogram(closes: number[]) {
    const ema = (xs: (number | null)[], n: number) => {
      const out: (number | null)[] = xs.map(() => null);
      const start = xs.findIndex((x) => x != null);
      if (start < 0 || xs.length - start < n) return out;
      let e = (xs.slice(start, start + n) as number[]).reduce((a, b) => a + b, 0) / n;
      out[start + n - 1] = e;
      for (let i = start + n; i < xs.length; i++) out[i] = e = (xs[i] as number) * (2 / (n + 1)) + e * (1 - 2 / (n + 1));
      return out;
    };
    const e12 = ema(closes, 12);
    const e26 = ema(closes, 26);
    const macd = closes.map((_, i) => (e12[i] != null && e26[i] != null ? e12[i]! - e26[i]! : null));
    const sig = ema(macd, 9);
    return macd.map((m, i) => (m != null && sig[i] != null ? m - sig[i]! : null)).filter((x): x is number => x != null);
  }

  it('is exactly zero on a straight line (EMA lags are constant)', () => {
    const line = Array.from({ length: 80 }, (_, i) => 100 + 2 * i);
    const h = macdHistogram(line);
    expect(h).toHaveLength(80 - 33);
    h.forEach((x) => expect(Math.abs(x)).toBeLessThan(1e-9));
  });

  it('matches a straightforward reference implementation', () => {
    const closes = Array.from({ length: 120 }, (_, i) => 100 + 10 * Math.sin(i / 6) + i / 4);
    const ours = macdHistogram(closes);
    const ref = referenceHistogram(closes);
    expect(ours).toHaveLength(ref.length);
    ours.forEach((x, i) => expect(x).toBeCloseTo(ref[i], 10));
  });

  it('turns negative when an uptrend stalls', () => {
    const closes = [...Array.from({ length: 60 }, (_, i) => 100 + i), ...Array(10).fill(160)];
    expect(macdHistogram(closes).at(-1)!).toBeLessThan(0);
  });

  it('needs 34 closes', () => {
    expect(macdHistogram(Array(33).fill(1))).toEqual([]);
    expect(macdHistogram(Array(34).fill(1))).toHaveLength(1);
  });
});
