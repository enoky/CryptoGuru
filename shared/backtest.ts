import { classify, combine, computeMetrics, INDICATORS, type IndicatorKey, type Sig, type SignalLabel } from './signals';
import type { Candle } from './types';

/**
 * Replays the live signal rules on past daily prices and records what the
 * price did next. Each day uses only data up to that day's close, over the
 * same 365-day window the coin page uses.
 */

export const DAY = 86_400_000;
export const HORIZONS = [7, 30] as const;
export type Horizon = (typeof HORIZONS)[number];
/** Days of history needed before the first reading, so every indicator (incl. the 200-day average) has data. */
export const WARMUP_DAYS = 200;
export const WINDOW_DAYS = 365;

export interface Reading {
  t: number;
  signals: Record<IndicatorKey, Sig | null>;
  label: SignalLabel | null;
  /** Return over the next 7 / 30 days, as a fraction; null near the end of the data. */
  returns: Record<Horizon, number | null>;
}

export const dayKey = (t: number) => Math.floor(t / DAY);

/** Completed daily candles only: today's still-open candle is dropped. */
export function completedDays(candles: Candle[], now: number): Candle[] {
  return candles.filter((c) => c.t + DAY <= now);
}

export function readings(daily: Candle[], fearGreedByDay: Map<number, number> | null): Reading[] {
  const out: Reading[] = [];
  for (let i = WARMUP_DAYS - 1; i < daily.length; i++) {
    // Stop once no horizon has a future price left.
    if (i + Math.min(...HORIZONS) >= daily.length) break;
    const window = daily.slice(Math.max(0, i - WINDOW_DAYS + 1), i + 1);
    const day = daily[i];
    // Evaluated at the day's close, so the day's own candle counts as completed.
    const metrics = computeMetrics(window, fearGreedByDay?.get(dayKey(day.t)) ?? null, day.t + DAY);
    if (!metrics) continue;
    const signals = classify(metrics);
    const combined = combine(signals, metrics.volatility);
    const returns = {} as Record<Horizon, number | null>;
    for (const h of HORIZONS) returns[h] = i + h < daily.length ? daily[i + h].c / day.c - 1 : null;
    out.push({ t: day.t, signals, label: combined?.label ?? null, returns });
  }
  return out;
}

export interface Tally {
  n: number;
  rose: number;
  fell: number;
  /** Sum of returns, for the average. */
  sum: number;
}

const emptyTally = (): Tally => ({ n: 0, rose: 0, fell: 0, sum: 0 });

function add(t: Tally, r: number) {
  t.n++;
  if (r > 0) t.rose++;
  else if (r < 0) t.fell++;
  t.sum += r;
}

export const LABELS: SignalLabel[] = ['Strong bullish signals', 'Leaning bullish', 'Mixed / neutral', 'Leaning bearish', 'Strong bearish signals'];

export interface HorizonResult {
  /** Every evaluated coin-day: the yardstick for everything else. */
  baseline: Tally;
  indicators: Record<IndicatorKey, { bullish: Tally; bearish: Tally; neutral: Tally }>;
  labels: Record<SignalLabel, Tally>;
}

export interface BacktestResult {
  coins: string[];
  from: number;
  to: number;
  horizons: Record<Horizon, HorizonResult>;
}

export function emptyHorizon(): HorizonResult {
  const indicators = {} as HorizonResult['indicators'];
  for (const i of INDICATORS) indicators[i.key] = { bullish: emptyTally(), bearish: emptyTally(), neutral: emptyTally() };
  const labels = {} as HorizonResult['labels'];
  for (const l of LABELS) labels[l] = emptyTally();
  return { baseline: emptyTally(), indicators, labels };
}

export function emptyResult(): BacktestResult {
  return { coins: [], from: Infinity, to: -Infinity, horizons: { 7: emptyHorizon(), 30: emptyHorizon() } };
}

/** Add one coin's readings into the running result. */
export function tally(result: BacktestResult, coinId: string, rs: Reading[]): BacktestResult {
  if (rs.length === 0) return result;
  result.coins.push(coinId);
  for (const r of rs) {
    result.from = Math.min(result.from, r.t);
    result.to = Math.max(result.to, r.t);
    for (const h of HORIZONS) {
      const ret = r.returns[h];
      if (ret == null) continue;
      const hr = result.horizons[h];
      add(hr.baseline, ret);
      for (const i of INDICATORS) {
        const s = r.signals[i.key];
        if (s == null) continue;
        add(hr.indicators[i.key][s === 1 ? 'bullish' : s === -1 ? 'bearish' : 'neutral'], ret);
      }
      if (r.label) add(hr.labels[r.label], ret);
    }
  }
  return result;
}

export const pctRose = (t: Tally) => (t.n ? (t.rose / t.n) * 100 : null);
export const pctFell = (t: Tally) => (t.n ? (t.fell / t.n) * 100 : null);
export const avgReturn = (t: Tally) => (t.n ? (t.sum / t.n) * 100 : null);
