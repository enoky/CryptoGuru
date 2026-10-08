import type { Candle } from './types';

/** Evenly pick about `n` points, always keeping the last one. */
export function downsample(values: number[], n: number): number[] {
  if (values.length <= n) return values.slice();
  const step = (values.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => values[Math.round(i * step)]);
}

/**
 * 30-day annualized volatility from daily candles, in percent:
 * standard deviation of daily log returns × √365.
 */
export function annualizedVolatility(daily: Candle[], window = 30): number | null {
  const closes = daily.slice(-(window + 1)).map((c) => c.c);
  if (closes.length < window + 1) return null;
  const rets = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(365) * 100;
}

export function volatilityLabel(pct: number): 'Low' | 'Medium' | 'High' {
  return pct < 40 ? 'Low' : pct <= 80 ? 'Medium' : 'High';
}

/** Sorted by time, one candle per timestamp, only sane prices. */
export function cleanCandles(candles: Candle[]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const c of candles) {
    if ([c.o, c.h, c.l, c.c].every((x) => Number.isFinite(x) && x > 0) && Number.isFinite(c.t)) byTime.set(c.t, c);
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

/** Round to `digits` significant figures: plenty for drawing, and much shorter JSON. */
export const roundSig = (n: number, digits = 5) => (n === 0 || !Number.isFinite(n) ? n : Number(n.toPrecision(digits)));
