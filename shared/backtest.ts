import {
  BTC_ID,
  classify,
  combine,
  computeMetrics,
  dirOf,
  GROUPS,
  THRESHOLDS,
  type Agreement,
  type GroupKey,
  type Metrics,
  type SignalContext,
  type SignalLabel,
  type Checks,
  toneOf,
} from './signals';
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
  metrics: Metrics;
  signals: Checks['signals'];
  label: SignalLabel | null;
  /** −100…+100, or null when there was no rating. */
  score: number | null;
  agreement: Agreement | null;
  /** Return over the next 7 / 30 days, as a fraction; null near the end of the data. */
  returns: Record<Horizon, number | null>;
}

export const dayKey = (t: number) => Math.floor(t / DAY);

/** Completed daily candles only: today's still-open candle is dropped. */
export function completedDays(candles: Candle[], now: number): Candle[] {
  return candles.filter((c) => c.t + DAY <= now);
}

/** Market context for one past day. */
export interface MarketDay {
  btcReturn90d: number | null;
  breadth: number | null;
}

/**
 * Bitcoin's 90-day return and breadth (share of the given coins above their
 * 200-day average) for each day, from completed daily candles. Breadth only
 * covers the coins passed in, so with few coins it is a rough guide.
 */
export function marketHistory(coins: { id: string; candles: Candle[] }[]): Map<number, MarketDay> {
  const out = new Map<number, MarketDay>();
  const at = (d: number) => {
    let e = out.get(d);
    if (!e) out.set(d, (e = { btcReturn90d: null, breadth: null }));
    return e;
  };
  const btc = coins.find((c) => c.id === BTC_ID);
  if (btc) {
    const byDay = new Map(btc.candles.map((c) => [dayKey(c.t), c.c]));
    for (const [d, close] of byDay) {
      const then = byDay.get(d - THRESHOLDS.strengthDays);
      if (then) at(d).btcReturn90d = ((close - then) / then) * 100;
    }
  }
  const counts = new Map<number, { above: number; n: number }>();
  for (const coin of coins) {
    const closes = coin.candles.map((c) => c.c);
    let sum = 0;
    for (let i = 0; i < closes.length; i++) {
      sum += closes[i];
      if (i >= 200) sum -= closes[i - 200];
      if (i < 199) continue;
      const d = dayKey(coin.candles[i].t);
      const c = counts.get(d) ?? { above: 0, n: 0 };
      c.n++;
      if (closes[i] > sum / 200) c.above++;
      counts.set(d, c);
    }
  }
  for (const [d, c] of counts) if (c.n >= THRESHOLDS.minBreadthCoins) at(d).breadth = Math.round((c.above / c.n) * 100);
  return out;
}

/** The context the live job would have had for `id` on day `t`. */
export function contextFor(id: string, t: number, market: Map<number, MarketDay> | null, fearGreed: Map<number, number> | null): SignalContext {
  const d = dayKey(t);
  const m = market?.get(d);
  return {
    fearGreed: fearGreed?.get(d) ?? null,
    btcReturn90d: id === BTC_ID ? null : (m?.btcReturn90d ?? null),
    breadth: m?.breadth ?? null,
  };
}

export function readings(
  id: string,
  daily: Candle[],
  market: Map<number, MarketDay> | null,
  fearGreedByDay: Map<number, number> | null,
): Reading[] {
  const out: Reading[] = [];
  for (let i = WARMUP_DAYS - 1; i < daily.length; i++) {
    // Stop once no horizon has a future price left.
    if (i + Math.min(...HORIZONS) >= daily.length) break;
    const window = daily.slice(Math.max(0, i - WINDOW_DAYS + 1), i + 1);
    const day = daily[i];
    // Evaluated at the day's close, so the day's own candle counts as completed.
    const metrics = computeMetrics(window, contextFor(id, day.t, market, fearGreedByDay), day.t + DAY);
    if (!metrics) continue;
    const { signals } = classify(metrics);
    const combined = combine(signals, metrics);
    const returns = {} as Record<Horizon, number | null>;
    for (const h of HORIZONS) returns[h] = i + h < daily.length ? daily[i + h].c / day.c - 1 : null;
    out.push({ t: day.t, metrics, signals, label: combined?.label ?? null, score: combined?.score ?? null, agreement: combined?.agreement ?? null, returns });
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

/** Directional calls (uptrend or downtrend ratings) and how many the price then agreed with. */
export interface Hits {
  n: number;
  right: number;
}

const emptyTally = (): Tally => ({ n: 0, rose: 0, fell: 0, sum: 0 });

function add(t: Tally, r: number) {
  t.n++;
  if (r > 0) t.rose++;
  else if (r < 0) t.fell++;
  t.sum += r;
}

export const LABELS: SignalLabel[] = ['Strong uptrend', 'Uptrend', 'No clear trend', 'Downtrend', 'Strong downtrend'];
export const AGREEMENTS: Agreement[] = ['High', 'Medium', 'Low'];

export interface HorizonResult {
  /** Every evaluated coin-day: the yardstick for everything else. */
  baseline: Tally;
  groups: Record<GroupKey, { up: Tally; down: Tally; neutral: Tally }>;
  labels: Record<SignalLabel, Tally>;
  /** Uptrend and downtrend ratings by agreement: were ratings the checks agreed on more often right? */
  calls: Record<Agreement, Hits>;
}

export interface BacktestResult {
  coins: string[];
  from: number;
  to: number;
  horizons: Record<Horizon, HorizonResult>;
}

export function emptyHorizon(): HorizonResult {
  const groups = {} as HorizonResult['groups'];
  for (const g of GROUPS) groups[g.key] = { up: emptyTally(), down: emptyTally(), neutral: emptyTally() };
  const labels = {} as HorizonResult['labels'];
  for (const l of LABELS) labels[l] = emptyTally();
  const calls = {} as HorizonResult['calls'];
  for (const c of AGREEMENTS) calls[c] = { n: 0, right: 0 };
  return { baseline: emptyTally(), groups, labels, calls };
}

export function emptyResult(): BacktestResult {
  return { coins: [], from: Infinity, to: -Infinity, horizons: { 7: emptyHorizon(), 30: emptyHorizon() } };
}

const toneOfLabel = (l: SignalLabel) => ({ up: 1, down: -1, neutral: 0 })[toneOf(l)];

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
      for (const g of GROUPS) {
        const s = dirOf(r.signals[g.key]);
        if (s == null) continue;
        add(hr.groups[g.key][s === 1 ? 'up' : s === -1 ? 'down' : 'neutral'], ret);
      }
      if (r.label) {
        add(hr.labels[r.label], ret);
        const dir = toneOfLabel(r.label);
        if (dir !== 0 && r.agreement) {
          const c = hr.calls[r.agreement];
          c.n++;
          if (Math.sign(ret) === dir) c.right++;
        }
      }
    }
  }
  return result;
}

export const pctRose = (t: Tally) => (t.n ? (t.rose / t.n) * 100 : null);
export const pctFell = (t: Tally) => (t.n ? (t.fell / t.n) * 100 : null);
export const avgReturn = (t: Tally) => (t.n ? (t.sum / t.n) * 100 : null);
export const pctRight = (h: Hits) => (h.n ? (h.right / h.n) * 100 : null);
