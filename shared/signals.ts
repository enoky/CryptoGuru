import { macdHistogram, rsi, sma } from './indicators';
import { annualizedVolatility } from './series';
import type { Candle, SourceName } from './types';

/**
 * Transparent, rule-based signals (PLAN.md §5). Every threshold is here;
 * nothing is learned or predicted. Explanations are written in the app
 * (src/lib/explain.ts) from the stored metrics.
 */

export const INDICATORS = [
  { key: 'trend', name: 'Long-term trend', weight: 25 },
  { key: 'cross', name: '50/200-day averages', weight: 15 },
  { key: 'macd', name: 'Momentum (MACD)', weight: 20 },
  { key: 'rsi', name: 'RSI (14 days)', weight: 15 },
  { key: 'volume', name: 'Trading volume', weight: 10 },
  { key: 'mood', name: 'Market mood', weight: 15 },
] as const;

export type IndicatorKey = (typeof INDICATORS)[number]['key'];
/** +1 bullish, −1 bearish, 0 neutral, null when there isn't enough data. */
export type Sig = 1 | 0 | -1;

export const THRESHOLDS = {
  trendPct: 2,
  crossPct: 1,
  macdDays: 3,
  rsiOversold: 30,
  rsiOverbought: 70,
  volumeRatio: 1.3,
  extremeFear: 25,
  extremeGreed: 75,
  highVolatility: 80,
} as const;

export type SignalLabel = 'Strong bullish signals' | 'Leaning bullish' | 'Mixed / neutral' | 'Leaning bearish' | 'Strong bearish signals';
export type Confidence = 'High' | 'Medium' | 'Low';
export type Tone = 'bullish' | 'bearish' | 'neutral';

export interface Metrics {
  close: number;
  /** Daily candles used. */
  days: number;
  sma50: number | null;
  sma200: number | null;
  /** Last 4 MACD histogram values, oldest first. */
  macdHist: number[] | null;
  rsi: number | null;
  /** 7-day average volume ÷ 30-day average volume (completed days only). */
  volumeRatio: number | null;
  return7d: number | null;
  fearGreed: number | null;
  volatility: number | null;
}

export interface CoinSignal {
  id: string;
  asOf: number;
  source: SourceName;
  metrics: Metrics;
  signals: Record<IndicatorKey, Sig | null>;
  /** −100 to +100. */
  score: number;
  label: SignalLabel;
  tone: Tone;
  confidence: Confidence;
}

export interface SignalsDoc {
  asOf: number;
  items: Record<string, CoinSignal>;
  /** Coins attempted but not rated (too little history or no data), with when. */
  skipped: Record<string, number>;
}

export const emptySignalsDoc = (): SignalsDoc => ({ asOf: 0, items: {}, skipped: {} });

/** Pegged to ~$1, so trend signals mean nothing. */
export const STABLECOINS = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'TUSD', 'USDE', 'USDS', 'PYUSD', 'USD1', 'BUSD', 'USDD', 'FRAX', 'GUSD', 'USDP', 'LUSD', 'EURC', 'RLUSD', 'USDG', 'USDF', 'BFUSD', 'USD0', 'SUSDE', 'SUSDS']);
export const isStablecoin = (symbol: string) => STABLECOINS.has(symbol.toUpperCase());

const DAY = 86_400_000;

export function computeMetrics(daily: Candle[], fearGreed: number | null, now: number): Metrics | null {
  if (daily.length < 2) return null;
  const closes = daily.map((c) => c.c);
  const close = closes[closes.length - 1];

  // Today's candle is still open, so its volume is partial: leave it out.
  const completed = daily.filter((c) => c.t + DAY <= now);
  const vols = completed.map((c) => c.v);
  let volumeRatio: number | null = null;
  if (vols.length >= 30) {
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const v30 = avg(vols.slice(-30));
    if (v30 > 0) volumeRatio = avg(vols.slice(-7)) / v30;
  }

  const hist = macdHistogram(closes);
  return {
    close,
    days: daily.length,
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    macdHist: hist.length >= THRESHOLDS.macdDays + 1 ? hist.slice(-(THRESHOLDS.macdDays + 1)) : null,
    rsi: rsi(closes, 14),
    volumeRatio,
    return7d: closes.length >= 8 ? ((close - closes[closes.length - 8]) / closes[closes.length - 8]) * 100 : null,
    fearGreed,
    volatility: annualizedVolatility(daily),
  };
}

const pctFrom = (a: number, b: number) => ((a - b) / b) * 100;

export function classify(m: Metrics): Record<IndicatorKey, Sig | null> {
  const T = THRESHOLDS;
  const band = (pct: number, limit: number): Sig => (pct > limit ? 1 : pct < -limit ? -1 : 0);

  let macd: Sig | null = null;
  if (m.macdHist) {
    const h = m.macdHist;
    const rising = h.every((x, i) => i === 0 || x > h[i - 1]);
    const falling = h.every((x, i) => i === 0 || x < h[i - 1]);
    const last = h[h.length - 1];
    macd = last > 0 && rising ? 1 : last < 0 && falling ? -1 : 0;
  }

  let volume: Sig | null = null;
  if (m.volumeRatio != null && m.return7d != null) {
    volume = m.volumeRatio > T.volumeRatio ? (m.return7d > 0 ? 1 : m.return7d < 0 ? -1 : 0) : 0;
  }

  return {
    trend: m.sma200 != null ? band(pctFrom(m.close, m.sma200), T.trendPct) : null,
    cross: m.sma50 != null && m.sma200 != null ? band(pctFrom(m.sma50, m.sma200), T.crossPct) : null,
    macd,
    rsi: m.rsi == null ? null : m.rsi < T.rsiOversold ? 1 : m.rsi > T.rsiOverbought ? -1 : 0,
    volume,
    mood: m.fearGreed == null ? null : m.fearGreed <= T.extremeFear ? 1 : m.fearGreed >= T.extremeGreed ? -1 : 0,
  };
}

export function labelFor(score: number): { label: SignalLabel; tone: Tone } {
  if (score >= 50) return { label: 'Strong bullish signals', tone: 'bullish' };
  if (score >= 15) return { label: 'Leaning bullish', tone: 'bullish' };
  if (score > -15) return { label: 'Mixed / neutral', tone: 'neutral' };
  if (score > -50) return { label: 'Leaning bearish', tone: 'bearish' };
  return { label: 'Strong bearish signals', tone: 'bearish' };
}

/**
 * Weighted score over the indicators that had enough data. Confidence is the
 * share of indicators agreeing with the overall direction (for a neutral
 * score: the share that are themselves neutral), lowered one level when
 * volatility is high or fewer than 5 indicators had data.
 */
export function combine(
  signals: Record<IndicatorKey, Sig | null>,
  volatility: number | null,
): { score: number; label: SignalLabel; tone: Tone; confidence: Confidence } | null {
  const available = INDICATORS.filter((i) => signals[i.key] != null);
  if (available.length < 3) return null;
  const totalWeight = available.reduce((a, i) => a + i.weight, 0);
  const score = Math.round((available.reduce((a, i) => a + i.weight * signals[i.key]!, 0) / totalWeight) * 100);
  const { label, tone } = labelFor(score);

  const dir: Sig = tone === 'bullish' ? 1 : tone === 'bearish' ? -1 : 0;
  const pool = dir === 0 ? available : available.filter((i) => signals[i.key] !== 0);
  const agreement = pool.length ? pool.filter((i) => signals[i.key] === dir).length / pool.length : 0;
  const levels: Confidence[] = ['Low', 'Medium', 'High'];
  let level = agreement >= 0.75 ? 2 : agreement >= 0.5 ? 1 : 0;
  if ((volatility != null && volatility > THRESHOLDS.highVolatility) || available.length < 5) level = Math.max(0, level - 1);

  return { score, label, tone, confidence: levels[level] };
}

export function computeSignal(id: string, daily: Candle[], source: SourceName, fearGreed: number | null, now: number): CoinSignal | null {
  const metrics = computeMetrics(daily, fearGreed, now);
  if (!metrics) return null;
  const signals = classify(metrics);
  const combined = combine(signals, metrics.volatility);
  if (!combined) return null;
  return { id, asOf: now, source, metrics, signals, ...combined };
}

/** The indicators that most support the overall reading, strongest first. */
export function topReasons(s: CoinSignal, n = 2): IndicatorKey[] {
  const dir: Sig = s.tone === 'bullish' ? 1 : s.tone === 'bearish' ? -1 : 0;
  return [...INDICATORS]
    .filter((i) => s.signals[i.key] === dir)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, n)
    .map((i) => i.key);
}

