import { macdHistogram, rsi, sma } from './indicators';
import { annualizedVolatility } from './series';
import type { Candle, SourceName } from './types';

/**
 * Transparent, rule-based signals (PLAN.md §5). Every threshold is here;
 * nothing is learned or predicted. Explanations are written in the app
 * (src/lib/explain.ts) from the stored metrics.
 *
 * Four scored groups, each from −1 (pointing down) to +1 (pointing up). The three trend
 * checks measure much the same thing, so they are averaged into one group
 * rather than voting three times. Fear & Greed, market breadth, liquidity and
 * distance from the all-time high are market context: they never change the
 * score; they are listed as cautions when they lean against a rating.
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

/** +1 up, −1 down, 0 neutral. */
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
  /** A group reading counts as pointing up or down (for agreement and the backtest) from ±0.25. */
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

export type SignalLabel = 'Strong uptrend' | 'Uptrend' | 'No clear trend' | 'Downtrend' | 'Strong downtrend';
/** How many of the scored checks point the same way. It says nothing about how often a rating has been right. */
export type Agreement = 'High' | 'Medium' | 'Low';
export type Tone = 'up' | 'down' | 'neutral';

/** Reasons to treat a rating with extra caution, listed with it. They don't change the score or the agreement. */
export type Caution = 'volatile' | 'fewChecks' | 'thin' | 'greed' | 'fear' | 'weakMarket' | 'strongMarket';

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
  agreement: Agreement;
  cautions: Caution[];
}

export interface MarketContext {
  btcReturn90d: number | null;
  breadth: number | null;
  /** Coins with 200 days of history that breadth was measured over. */
  breadthCoins: number;
}

/** Bumped when CoinSignal changes shape, so old stored ratings are dropped rather than misread. */
export const SIGNALS_VERSION = 3;

export interface SignalsDoc {
  version: typeof SIGNALS_VERSION;
  asOf: number;
  items: Record<string, CoinSignal>;
  /** Coins attempted but not rated (too little history or no data), with when. */
  skipped: Record<string, number>;
  /** Coins whose price turned out to be pegged (see hasPeggedPrice), with when that was last checked. Not rated. */
  pegged: Record<string, number>;
  market: MarketContext;
}

export const emptySignalsDoc = (): SignalsDoc => ({
  version: SIGNALS_VERSION,
  asOf: 0,
  items: {},
  skipped: {},
  pegged: {},
  market: { btcReturn90d: null, breadth: null, breadthCoins: 0 },
});

/**
 * Assets whose price tracks something outside crypto, so trend signals mean
 * nothing: stablecoins and gold-backed tokens. Others (tokenised money-market
 * funds, newer stablecoins) are caught by how little their price moves.
 */
export const PEGGED_SYMBOLS = new Set([
  'USDT', 'USDC', 'DAI', 'FDUSD', 'TUSD', 'USDE', 'USDS', 'PYUSD', 'USD1', 'BUSD', 'USDD', 'FRAX', 'GUSD', 'USDP', 'LUSD', 'EURC', 'RLUSD',
  'USDG', 'USDF', 'BFUSD', 'USD0', 'SUSDE', 'SUSDS', 'GHO', 'USDY', 'USYC', 'BUIDL', 'USDTB', 'USDX',
  // Gold: moves like gold, not like crypto.
  'XAUT', 'PAXG', 'KAU', 'XAUM',
]);
export const isPeggedSymbol = (symbol: string) => PEGGED_SYMBOLS.has(symbol.toUpperCase());

/**
 * Annualized volatility (%) below which a price counts as pegged, whatever its
 * symbol. Even Bitcoin's quietest 90 days stay far above this; a euro-pegged
 * token moves about 7% a year.
 */
export const PEG_MAX_VOLATILITY = 10;

/** True when the last 90 days (at least 30) of daily prices barely moved. */
export function hasPeggedPrice(daily: Candle[]): boolean {
  const window = Math.min(90, daily.length - 1);
  if (window < 30) return false;
  const v = annualizedVolatility(daily, window);
  return v != null && v < PEG_MAX_VOLATILITY;
}

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
  if (score >= 50) return { label: 'Strong uptrend', tone: 'up' };
  if (score >= 15) return { label: 'Uptrend', tone: 'up' };
  if (score > -15) return { label: 'No clear trend', tone: 'neutral' };
  if (score > -50) return { label: 'Downtrend', tone: 'down' };
  return { label: 'Strong downtrend', tone: 'down' };
}

/** The direction a rating's label describes. */
export const toneOf = (label: SignalLabel): Tone =>
  label === 'Strong uptrend' || label === 'Uptrend' ? 'up' : label === 'Strong downtrend' || label === 'Downtrend' ? 'down' : 'neutral';

export interface Combined {
  score: number;
  label: SignalLabel;
  tone: Tone;
  agreement: Agreement;
  cautions: Caution[];
}

/**
 * Weighted score over the groups that had enough data (the trend group is
 * required). Agreement is the share of groups with data that point the
 * overall way (for a neutral score: the share that are themselves neutral):
 * 75% or more High, 50% or more Medium. Cautions are listed alongside: high
 * volatility, fewer than 3 groups, thin trading, and market context leaning
 * against the reading.
 */
export function combine(signals: Record<GroupKey, number | null>, m: Metrics): Combined | null {
  const T = THRESHOLDS;
  const available = GROUPS.filter((g) => signals[g.key] != null);
  if (signals.trend == null || available.length < 2) return null;
  const totalWeight = available.reduce((a, g) => a + g.weight, 0);
  const score = Math.round((available.reduce((a, g) => a + g.weight * signals[g.key]!, 0) / totalWeight) * 100) || 0;
  const { label, tone } = labelFor(score);

  const dir: Sig = tone === 'up' ? 1 : tone === 'down' ? -1 : 0;
  // Neutral checks count as not agreeing with an up or down rating: 2 of 4 pointing up is Medium, not High.
  const share = available.filter((g) => dirOf(signals[g.key]) === dir).length / available.length;
  const agreement: Agreement = share >= 0.75 ? 'High' : share >= 0.5 ? 'Medium' : 'Low';

  const cautions: Caution[] = [];
  if (m.volatility != null && m.volatility > T.highVolatility) cautions.push('volatile');
  if (available.length < 3) cautions.push('fewChecks');
  if (m.turnover != null && m.turnover < T.thinTurnover) cautions.push('thin');
  // Market context: a crowd that already agrees, or a market moving the other way.
  if (dir === 1 && m.fearGreed != null && m.fearGreed >= T.extremeGreed) cautions.push('greed');
  if (dir === -1 && m.fearGreed != null && m.fearGreed <= T.extremeFear) cautions.push('fear');
  if (dir === 1 && m.breadth != null && m.breadth < T.weakBreadth) cautions.push('weakMarket');
  if (dir === -1 && m.breadth != null && m.breadth > T.strongBreadth) cautions.push('strongMarket');

  return { score, label, tone, agreement, cautions };
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
  const dir: Sig = s.tone === 'up' ? 1 : s.tone === 'down' ? -1 : 0;
  return GROUPS.filter((g) => dirOf(s.signals[g.key]) === dir)
    .map((g) => ({ key: g.key, w: g.weight * (dir === 0 ? 1 : Math.abs(s.signals[g.key]!)) }))
    .sort((a, b) => b.w - a.w)
    .slice(0, n)
    .map((g) => g.key);
}
