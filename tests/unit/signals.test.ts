import { describe, expect, it } from 'vitest';
import { classify, combine, computeMetrics, computeSignal, isStablecoin, labelFor, topReasons, type IndicatorKey, type Metrics, type Sig } from '../../shared/signals';
import type { Candle } from '../../shared/types';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

/** Daily candles ending today (the last one still open). */
const daily = (closes: number[], volume: (i: number) => number = () => 100): Candle[] =>
  closes.map((c, i) => ({ t: NOW - (closes.length - 1 - i) * DAY - DAY / 2, o: c, h: c, l: c, c, v: volume(i) }));

const base: Metrics = {
  close: 100,
  days: 365,
  sma50: 100,
  sma200: 100,
  macdHist: [0, 0, 0, 0],
  rsi: 50,
  volumeRatio: 1,
  return7d: 0,
  fearGreed: 50,
  volatility: 50,
};

const sigs = (s: Partial<Record<IndicatorKey, Sig | null>>): Record<IndicatorKey, Sig | null> => ({
  trend: 0,
  cross: 0,
  macd: 0,
  rsi: 0,
  volume: 0,
  mood: 0,
  ...s,
});

describe('classify', () => {
  it('reads trend against the 200-day average with a ±2% dead zone', () => {
    expect(classify({ ...base, close: 103 }).trend).toBe(1);
    expect(classify({ ...base, close: 101.9 }).trend).toBe(0);
    expect(classify({ ...base, close: 97 }).trend).toBe(-1);
    expect(classify({ ...base, sma200: null }).trend).toBeNull();
  });

  it('reads the 50/200 cross with a ±1% dead zone', () => {
    expect(classify({ ...base, sma50: 101.5 }).cross).toBe(1);
    expect(classify({ ...base, sma50: 99.5 }).cross).toBe(0);
    expect(classify({ ...base, sma50: 98 }).cross).toBe(-1);
  });

  it('needs MACD rising 3 days in a row and above zero to be bullish', () => {
    expect(classify({ ...base, macdHist: [0.1, 0.2, 0.3, 0.4] }).macd).toBe(1);
    expect(classify({ ...base, macdHist: [0.1, 0.3, 0.2, 0.4] }).macd).toBe(0);
    expect(classify({ ...base, macdHist: [-0.4, -0.3, -0.2, -0.1] }).macd).toBe(0); // rising but below zero
    expect(classify({ ...base, macdHist: [-0.1, -0.2, -0.3, -0.4] }).macd).toBe(-1);
  });

  it('treats RSI under 30 as oversold (bullish) and over 70 as overbought (bearish)', () => {
    expect(classify({ ...base, rsi: 29 }).rsi).toBe(1);
    expect(classify({ ...base, rsi: 30 }).rsi).toBe(0);
    expect(classify({ ...base, rsi: 71 }).rsi).toBe(-1);
  });

  it('only counts volume when it is unusually high, in the direction of the 7-day move', () => {
    expect(classify({ ...base, volumeRatio: 1.5, return7d: 4 }).volume).toBe(1);
    expect(classify({ ...base, volumeRatio: 1.5, return7d: -4 }).volume).toBe(-1);
    expect(classify({ ...base, volumeRatio: 1.2, return7d: 9 }).volume).toBe(0);
  });

  it('reads extreme fear as contrarian bullish and extreme greed as bearish', () => {
    expect(classify({ ...base, fearGreed: 25 }).mood).toBe(1);
    expect(classify({ ...base, fearGreed: 74 }).mood).toBe(0);
    expect(classify({ ...base, fearGreed: 75 }).mood).toBe(-1);
    expect(classify({ ...base, fearGreed: null }).mood).toBeNull();
  });
});

describe('labelFor', () => {
  it('uses the documented bands', () => {
    expect([50, 49, 15, 14, -14, -15, -49, -50].map((s) => labelFor(s).label)).toEqual([
      'Strong bullish signals',
      'Leaning bullish',
      'Leaning bullish',
      'Mixed / neutral',
      'Mixed / neutral',
      'Leaning bearish',
      'Leaning bearish',
      'Strong bearish signals',
    ]);
  });
});

describe('combine', () => {
  it('scores all-bullish as +100 with high confidence', () => {
    expect(combine(sigs({ trend: 1, cross: 1, macd: 1, rsi: 1, volume: 1, mood: 1 }), 30)).toEqual({
      score: 100,
      label: 'Strong bullish signals',
      tone: 'bullish',
      confidence: 'High',
    });
  });

  it('weights indicators: trend 25 + macd 20 against rsi 15', () => {
    // (25 + 20 − 15) / 100 = 30
    expect(combine(sigs({ trend: 1, macd: 1, rsi: -1 }), 30)).toMatchObject({ score: 30, label: 'Leaning bullish', confidence: 'Medium' });
  });

  it('rescales over the indicators that had data', () => {
    // Only trend (25) and mood (15) available plus a neutral RSI: (25 + 15) / 55 = 73.
    const r = combine(sigs({ trend: 1, cross: null, macd: null, rsi: 0, volume: null, mood: 1 }), 30)!;
    expect(r.score).toBe(73);
    expect(r.confidence).toBe('Medium'); // all agree (High), lowered for having fewer than 5 indicators
  });

  it('lowers confidence one level when volatility is high', () => {
    expect(combine(sigs({ trend: 1, cross: 1, macd: 1, rsi: 1, volume: 1, mood: 1 }), 95)!.confidence).toBe('Medium');
  });

  it('rates a mostly-neutral picture as mixed with high confidence', () => {
    expect(combine(sigs({}), 30)).toMatchObject({ score: 0, label: 'Mixed / neutral', confidence: 'High' });
  });

  it('gives no rating with fewer than 3 indicators', () => {
    expect(combine(sigs({ trend: 1, cross: 1, macd: null, rsi: null, volume: null, mood: null }), 30)).toBeNull();
  });
});

describe('computeMetrics / computeSignal', () => {
  it('rates a steady uptrend with rising volume as bullish', () => {
    const closes = Array.from({ length: 365 }, (_, i) => 100 * 1.004 ** i + Math.sin(i) * 0.5);
    const s = computeSignal('coin', daily(closes, (i) => (i > 357 ? 200 : 100)), 'binance', 50, NOW)!;
    expect(s.signals.trend).toBe(1);
    expect(s.signals.cross).toBe(1);
    expect(s.signals.volume).toBe(1);
    expect(s.tone).toBe('bullish');
    expect(s.metrics.days).toBe(365);
  });

  it('leaves out the still-open daily candle when measuring volume', () => {
    const closes = Array(40).fill(100);
    // Huge volume only on today's open candle should not count.
    const m = computeMetrics(daily(closes, (i) => (i === 39 ? 1e9 : 100)), null, NOW)!;
    expect(m.volumeRatio).toBe(1);
  });

  it('marks long-term indicators as missing for young coins', () => {
    const m = computeMetrics(daily(Array.from({ length: 60 }, (_, i) => 100 + i)), 50, NOW)!;
    expect(m.sma200).toBeNull();
    const s = classify(m);
    expect(s.trend).toBeNull();
    expect(s.cross).toBeNull();
    expect(s.macd).not.toBeNull();
  });

  it('returns no signal without enough data', () => {
    expect(computeSignal('x', daily([1, 2, 3]), 'binance', null, NOW)).toBeNull();
  });
});

describe('helpers', () => {
  it('picks the heaviest agreeing indicators as top reasons', () => {
    const s = computeSignal('c', daily(Array.from({ length: 365 }, (_, i) => 100 + i)), 'binance', 20, NOW)!;
    expect(topReasons(s)[0]).toBe('trend');
  });

  it('knows stablecoins', () => {
    expect(isStablecoin('usdt')).toBe(true);
    expect(isStablecoin('BTC')).toBe(false);
  });
});
