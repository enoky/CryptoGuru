import { describe, expect, it } from 'vitest';
import { annualizedVolatility, cleanCandles, downsample, volatilityLabel } from '../../shared/series';
import type { Candle } from '../../shared/types';

const daily = (closes: number[]): Candle[] => closes.map((c, i) => ({ t: i * 86_400_000, o: c, h: c, l: c, c, v: 1 }));

describe('downsample', () => {
  it('keeps first and last points', () => {
    const out = downsample([...Array(100).keys()], 10);
    expect(out).toHaveLength(10);
    expect(out[0]).toBe(0);
    expect(out[9]).toBe(99);
  });
  it('leaves short series alone', () => expect(downsample([1, 2, 3], 10)).toEqual([1, 2, 3]));
});

describe('annualizedVolatility', () => {
  it('is zero for a steady trend', () => {
    // Constant 1% daily growth: every log return equal, so standard deviation 0.
    const closes = Array.from({ length: 31 }, (_, i) => 100 * 1.01 ** i);
    expect(annualizedVolatility(daily(closes))).toBeCloseTo(0, 8);
  });

  it('matches a hand-computed value', () => {
    // Alternating ±r log returns: sample stdev = r·√(n/(n−1)) with n = 30.
    const r = 0.02;
    const closes = [100];
    for (let i = 0; i < 30; i++) closes.push(closes[i] * Math.exp(i % 2 ? -r : r));
    const expected = r * Math.sqrt(30 / 29) * Math.sqrt(365) * 100;
    expect(annualizedVolatility(daily(closes))).toBeCloseTo(expected, 6);
  });

  it('needs 31 closes', () => expect(annualizedVolatility(daily(Array(30).fill(1)))).toBeNull());

  it('labels low / medium / high', () => {
    expect(volatilityLabel(39)).toBe('Low');
    expect(volatilityLabel(80)).toBe('Medium');
    expect(volatilityLabel(81)).toBe('High');
  });
});

describe('cleanCandles', () => {
  it('sorts, de-duplicates and drops bad prices', () => {
    const c = (t: number, p: number): Candle => ({ t, o: p, h: p, l: p, c: p, v: 0 });
    expect(cleanCandles([c(3, 3), c(1, 1), c(1, 1.5), c(2, NaN), c(4, 0)]).map((x) => [x.t, x.c])).toEqual([
      [1, 1.5],
      [3, 3],
    ]);
  });
});
