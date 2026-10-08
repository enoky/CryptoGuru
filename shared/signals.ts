import { macdHistogram, rsi, sma } from './indicators';
import { annualizedVolatility } from './series';
import type { Candle, SourceName } from './types';

/**
 * Transparent, rule-based signals (PLAN.md §5). Every threshold is here;
 * nothing is learned or predicted. Explanations are written in the app
 * (src/lib/explain.ts) from the stored metrics.
 *
 * Four scored groups, each from −1 (bearish) to +1 (bullish). The three trend
 * checks measure much the same thing, so they are averaged into one group
 * rather than voting three times. Fear & Greed, market breadth, liquidity and
 * distance from the all-time high are market context: they never change the
 * score, only the confidence.
 */
export const GROUPS = [
  { key: 'trend', name: 'Trend', weight: 45 },
  { key: 'strength', name: 'Strength vs Bitcoin', weight: 25 },
  { key: 'rsi', name: 'RSI (14 days)', weight: 15 },
  { key: 'volume', name: 'Trading volume', weight: 15 },
] as const;

export type GroupKey = (typeof GROUPS)[number]['key'];

/** The trend group is the plain average of these three. */
export const TREND_PARTS = [
  { key: 'sma200', name: 'Price vs 200-day average' },
  { key: 'cross', name: '50/200-day averages' },
  { key: 'macd', name: 'Momentum (MACD)' },
] as const;

export type TrendPartKey = (typeof TREND_PARTS)[number]['key'];

/** +1 bullish, −1 bearish, 0 neutral. */
export type Sig = 1 | 0 | -1;

export const BTC_ID = 'bitcoin';

export const THRESHOLDS = {
  /** Price vs 200-day average, %: neutral inside the band, full strength at `Full` (both widened for volatile coins). */
  trendBand: 2,
  trendFull: 20,
  /** 50-day vs 200-day average, %. */
  crossBand: 1,
  crossFull: 10,
  /** Coin's return minus Bitcoin's over this many days, in percentage points. */
  strengthDays: 90,
  strengthBand: 5,
  strengthFull: 50,
  macdDays: 3,
  rsiOversold: 30,
  rsiOverbought: 70,
  volumeRatio: 1.3,
  /** Thresholds above widen for coins more volatile than this (annualized %), up to `volScaleMax` times. */
  volScaleFrom: 60,
  volScaleMax: 3,
  /** A group reading counts as bullish or bearish (for confidence and the backtest) from ±0.25. */
  clear: 0.25,
  highVolatility: 80,
  /** 24h volume under this % of market cap counts as thinly traded. */
  thinTurnover: 1,
  extremeFear: 25,
  extremeGreed: 75,
  /** Share of coins above their 200-day average, %. */
  weakBreadth: 25,
  strongBreadth: 75,
  /** Breadth needs at least this many coins with 200 days of history. */
  minBreadthCoins: 10,
} as const;

export type SignalLabel = 'Strong bullish signals' | 'Leaning bullish' | 'Mixed / neutral' | 'Leaning bearish' | 'Strong bearish signals';
export type Confidence = 'High' | 'Medium' | 'Low';
export type Tone = 'bullish' | 'bearish' | 'neutral';

/** Why confidence was lowered. */
export type Adjustment = 'volatile' | 'fewChecks' | 'thin' | 'greed' | 'fear' | 'weakMarket' | 'strongMarket';

/** Market-wide and per-coin context that comes from outside the coin's candles. */
export interface SignalContext {
  fearGreed?: number | null;
  /** Bitcoin's return over `strengthDays`, %. Leave out for Bitcoin itself. */
  btcReturn90d?: number | null;
  /** Share of rated coins above their 200-day average, %. */
  breadth?: number | null;
  /** 24h volume ÷ market cap, %. */
  turnover?: number | null;
  athChangePct?: number | null;
}

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
  /** Return over `strengthDays`, %. */
  return90d: number | null;
  volatility: number | null;
  btcReturn90d: number | null;
  fearGreed: number | null;
  breadth: number | null;
  turnover: number | null;
  athChangePct: number | null;
}

export interface Checks {
  /** Each −1…+1, or null when there isn't enough data. */
  signals: Record<GroupKey, number | null>;
  trendParts: Record<TrendPartKey, number | null>;
}

export interface CoinSignal extends Checks {
  id: string;
  asOf: number;
  source: SourceName;
  metrics: Metrics;
  /** −100 to +100. */
  score: number;
  label: SignalLabel;
  tone: Tone;
  confidence: Confidence;
  adjustments: Adjustment[];
}

export interface MarketContext {
  btcReturn90d: number | null;
  breadth: number | null;
  /** Coins with 200 days of history that breadth was measured over. */
  breadthCoins: number;
}

/** Bumped when CoinSignal changes shape, so old stored ratings are dropped rather than misread. */
export const SIGNALS_VERSION = 2;

export interface SignalsDoc {
  version: typeof SIGNALS_VERSION;
  asOf: number;
  items: Record<string, CoinSignal>;
  /** Coins attempted but not rated (too little history or no data), with when. */
  skipped: Record<string, number>;
  market: MarketContext;
}

export const emptySignalsDoc = (): SignalsDoc => ({
  version: SIGNALS_VERSION,
  asOf: 0,
  items: {},
  skipped: {},
  market: { btcReturn90d: null, breadth: null, breadthCoins: 0 },
});

/** Pegged to ~$1, so trend signals mean nothing. */
export const STABLECOINS = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'TUSD', 'USDE', 'USDS', 'PYUSD', 'USD1', 'BUSD', 'USDD', 'FRAX', 'GUSD', 'USDP', 'LUSD', 'EURC', 'RLUSD', 'USDG', 'USDF', 'BFUSD', 'USD0', 'SUSDE', 'SUSDS']);
export const isStablecoin = (symbol: string) => STABLECOINS.has(symbol.toUpperCase());

const DAY = 86_400_000;

export function computeMetrics(daily: Candle[], ctx: SignalContext, now: number): Metrics | null {
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

  const back = (n: number) => (closes.length > n ? ((close - closes[closes.length - 1 - n]) / closes[closes.length - 1 - n]) * 100 : null);
  const hist = macdHistogram(closes);
  return {
    close,
    days: daily.length,
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    macdHist: hist.length >= THRESHOLDS.macdDays + 1 ? hist.slice(-(THRESHOLDS.macdDays + 1)) : null,
    rsi: rsi(closes, 14),
    volumeRatio,
    return7d: back(7),
    return90d: back(THRESHOLDS.strengthDays),
    volatility: annualizedVolatility(daily),
    btcReturn90d: ctx.btcReturn90d ?? null,
    fearGreed: ctx.fearGreed ?? null,
    breadth: ctx.breadth ?? null,
    turnover: ctx.turnover ?? null,
    athChangePct: ctx.athChangePct ?? null,
  };
}

const pctFrom = (a: number, b: number) => ((a - b) / b) * 100;

/** 0 inside ±band, then rising in a straight line to ±1 at ±full. */
export function graded(x: number, band: number, full: number): number {
  const a = Math.abs(x);
  if (a <= band) return 0;
  return Math.sign(x) * Math.min(1, (a - band) / (full - band));
}

/** How much wider the thresholds are for this coin: 1 up to 60% volatility, then in proportion, at most 3. */
export function volScale(volatility: number | null): number {
  if (volatility == null) return 1;
  return Math.min(THRESHOLDS.volScaleMax, Math.max(1, volatility / THRESHOLDS.volScaleFrom));
}

/** The direction a −1…+1 reading counts as. */
export const dirOf = (v: number | null): Sig | null => (v == null ? null : v >= THRESHOLDS.clear ? 1 : v <= -THRESHOLDS.clear ? -1 : 0);

const round2 = (n: number) => Math.round(n * 100) / 100 || 0;

export function classify(m: Metrics): Checks {
  const T = THRESHOLDS;
  const s = volScale(m.volatility);

  let macd: number | null = null;
  if (m.macdHist) {
    const h = m.macdHist;
    const rising = h.every((x, i) => i === 0 || x > h[i - 1]);
    const falling = h.every((x, i) => i === 0 || x < h[i - 1]);
    const last = h[h.length - 1];
    macd = last > 0 && rising ? 1 : last < 0 && falling ? -1 : 0;
  }
  const trendParts: Record<TrendPartKey, number | null> = {
    sma200: m.sma200 != null ? round2(graded(pctFrom(m.close, m.sma200), T.trendBand * s, T.trendFull * s)) : null,
    cross: m.sma50 != null && m.sma200 != null ? round2(graded(pctFrom(m.sma50, m.sma200), T.crossBand * s, T.crossFull * s)) : null,
    macd,
  };
  const parts = Object.values(trendParts).filter((v): v is number => v != null);
  const trend = parts.length ? round2(parts.reduce((a, b) => a + b, 0) / parts.length) : null;

  const strength =
    m.return90d != null && m.btcReturn90d != null ? round2(graded(m.return90d - m.btcReturn90d, T.strengthBand * s, T.strengthFull * s)) : null;

  // Oversold is a dip worth noting in an uptrend, but in a downtrend prices that fell fast often keep falling.
  // Overbought is the mirror image. With no clear long-term trend, the classic contrarian reading applies.
  let rsiSig: number | null = null;
  if (m.rsi != null) {
    const longTrend = Math.sign(trendParts.sma200 ?? 0);
    if (m.rsi < T.rsiOversold) rsiSig = longTrend < 0 ? 0 : 1;
    else if (m.rsi > T.rsiOverbought) rsiSig = longTrend > 0 ? 0 : -1;
    else rsiSig = 0;
  }

  let volume: number | null = null;
  if (m.volumeRatio != null && m.return7d != null) {
    volume = m.volumeRatio > T.volumeRatio ? Math.sign(m.return7d) : 0;
  }

  return { signals: { trend, strength, rsi: rsiSig, volume }, trendParts };
}

export function labelFor(score: number): { label: SignalLabel; tone: Tone } {
  if (score >= 50) return { label: 'Strong bullish signals', tone: 'bullish' };
  if (score >= 15) return { label: 'Leaning bullish', tone: 'bullish' };
  if (score > -15) return { label: 'Mixed / neutral', tone: 'neutral' };
  if (score > -50) return { label: 'Leaning bearish', tone: 'bearish' };
  return { label: 'Strong bearish signals', tone: 'bearish' };
}

export interface Combined {
  score: number;
  label: SignalLabel;
  tone: Tone;
  confidence: Confidence;
  adjustments: Adjustment[];
}

/**
 * Weighted score over the groups that had enough data (the trend group is
 * required). Confidence is the share of clear group readings that agree with
 * the overall direction (for a neutral score: the share that are themselves
 * neutral), then lowered one level for each of: high volatility, fewer than
 * 3 groups, thin trading, and market context leaning against the reading.
 */
export function combine(signals: Record<GroupKey, number | null>, m: Metrics): Combined | null {
  const T = THRESHOLDS;
  const available = GROUPS.filter((g) => signals[g.key] != null);
  if (signals.trend == null || available.length < 2) return null;
  const totalWeight = available.reduce((a, g) => a + g.weight, 0);
  const score = Math.round((available.reduce((a, g) => a + g.weight * signals[g.key]!, 0) / totalWeight) * 100) || 0;
  const { label, tone } = labelFor(score);

  const dir: Sig = tone === 'bullish' ? 1 : tone === 'bearish' ? -1 : 0;
  const dirs = available.map((g) => dirOf(signals[g.key]));
  const pool = dir === 0 ? dirs : dirs.filter((d) => d !== 0);
  const agreement = pool.length ? pool.filter((d) => d === dir).length / pool.length : 0;
  let level = agreement >= 0.75 ? 2 : agreement >= 0.5 ? 1 : 0;

  const adjustments: Adjustment[] = [];
  if (m.volatility != null && m.volatility > T.highVolatility) adjustments.push('volatile');
  if (available.length < 3) adjustments.push('fewChecks');
  if (m.turnover != null && m.turnover < T.thinTurnover) adjustments.push('thin');
  // Market context: a crowd that already agrees, or a market moving the other way. At most one level between them.
  const market: Adjustment[] = [];
  if (dir === 1 && m.fearGreed != null && m.fearGreed >= T.extremeGreed) market.push('greed');
  if (dir === -1 && m.fearGreed != null && m.fearGreed <= T.extremeFear) market.push('fear');
  if (dir === 1 && m.breadth != null && m.breadth < T.weakBreadth) market.push('weakMarket');
  if (dir === -1 && m.breadth != null && m.breadth > T.strongBreadth) market.push('strongMarket');
  adjustments.push(...market);

  const steps = adjustments.length - Math.max(0, market.length - 1);
  level = Math.max(0, level - steps);
  const levels: Confidence[] = ['Low', 'Medium', 'High'];
  return { score, label, tone, confidence: levels[level], adjustments };
}

export function computeSignal(id: string, daily: Candle[], source: SourceName, ctx: SignalContext, now: number): CoinSignal | null {
  const metrics = computeMetrics(daily, id === BTC_ID ? { ...ctx, btcReturn90d: null } : ctx, now);
  if (!metrics) return null;
  const checks = classify(metrics);
  const combined = combine(checks.signals, metrics);
  if (!combined) return null;
  return { id, asOf: now, source, metrics, ...checks, ...combined };
}

/** Bitcoin's 90-day return and market breadth, from the ratings so far. */
export function marketContext(items: Record<string, CoinSignal>): MarketContext {
  const withTrend = Object.values(items).filter((s) => s.metrics.sma200 != null);
  const above = withTrend.filter((s) => s.metrics.close > s.metrics.sma200!).length;
  return {
    btcReturn90d: items[BTC_ID]?.metrics.return90d ?? null,
    breadth: withTrend.length >= THRESHOLDS.minBreadthCoins ? Math.round((above / withTrend.length) * 100) : null,
    breadthCoins: withTrend.length,
  };
}

/** The groups that most support the overall reading, strongest first. */
export function topReasons(s: Pick<CoinSignal, 'signals' | 'tone'>, n = 2): GroupKey[] {
  const dir: Sig = s.tone === 'bullish' ? 1 : s.tone === 'bearish' ? -1 : 0;
  return GROUPS.filter((g) => dirOf(s.signals[g.key]) === dir)
    .map((g) => ({ key: g.key, w: g.weight * (dir === 0 ? 1 : Math.abs(s.signals[g.key]!)) }))
    .sort((a, b) => b.w - a.w)
    .slice(0, n)
    .map((g) => g.key);
}
