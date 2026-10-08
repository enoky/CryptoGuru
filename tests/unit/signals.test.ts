import { describe, expect, it } from 'vitest';
import {
  classify,
  combine,
  computeMetrics,
  computeSignal,
  dirOf,
  graded,
  hasPeggedPrice,
  isPeggedSymbol,
  labelFor,
  marketContext,
  topReasons,
  volScale,
  type CoinSignal,
  type GroupKey,
  type Metrics,
} from '../../shared/signals';
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
  return90d: 10,
  volatility: 50,
  btcReturn90d: 10,
  fearGreed: 50,
  breadth: 50,
  turnover: 5,
  athChangePct: -30,
};

const groups = (s: Partial<Record<GroupKey, number | null>>): Record<GroupKey, number | null> => ({
  trend: 0,
  strength: 0,
  rsi: 0,
  volume: 0,
  ...s,
});

describe('graded and volScale', () => {
  it('is 0 inside the band, then rises to ±1 at the full value', () => {
    expect(graded(1.9, 2, 20)).toBe(0);
    expect(graded(11, 2, 20)).toBeCloseTo(0.5);
    expect(graded(-11, 2, 20)).toBeCloseTo(-0.5);
    expect(graded(80, 2, 20)).toBe(1);
    expect(graded(-80, 2, 20)).toBe(-1);
  });

  it('widens thresholds only for coins more volatile than 60% a year, at most 3×', () => {
    expect(volScale(null)).toBe(1);
    expect(volScale(40)).toBe(1);
    expect(volScale(120)).toBe(2);
    expect(volScale(400)).toBe(3);
  });

  it('counts a reading as a direction from ±0.25', () => {
    expect([0.25, 0.24, -0.24, -0.25, null].map(dirOf)).toEqual([1, 0, 0, -1, null]);
  });
});

describe('classify: trend', () => {
  it('grades price vs the 200-day average: neutral within ±2%, full at ±20%', () => {
    expect(classify({ ...base, close: 101.9 }).trendParts.sma200).toBe(0);
    expect(classify({ ...base, close: 111 }).trendParts.sma200).toBe(0.5);
    expect(classify({ ...base, close: 130 }).trendParts.sma200).toBe(1);
    expect(classify({ ...base, close: 70 }).trendParts.sma200).toBe(-1);
    expect(classify({ ...base, sma200: null }).trendParts.sma200).toBeNull();
  });

  it('widens the bands for volatile coins', () => {
    // 11% above: half strength normally, much weaker at 2× volatility (band 4%, full 40%).
    expect(classify({ ...base, close: 111, volatility: 120 }).trendParts.sma200).toBe(0.19);
  });

  it('grades the 50/200 cross: neutral within ±1%, full at ±10%', () => {
    expect(classify({ ...base, sma50: 100.9 }).trendParts.cross).toBe(0);
    expect(classify({ ...base, sma50: 110 }).trendParts.cross).toBe(1);
    expect(classify({ ...base, sma50: 94.5 }).trendParts.cross).toBe(-0.5);
  });

  it('needs MACD rising 3 days in a row and above zero to be bullish', () => {
    expect(classify({ ...base, macdHist: [0.1, 0.2, 0.3, 0.4] }).trendParts.macd).toBe(1);
    expect(classify({ ...base, macdHist: [0.1, 0.3, 0.2, 0.4] }).trendParts.macd).toBe(0);
    expect(classify({ ...base, macdHist: [-0.4, -0.3, -0.2, -0.1] }).trendParts.macd).toBe(0); // rising but below zero
    expect(classify({ ...base, macdHist: [-0.1, -0.2, -0.3, -0.4] }).trendParts.macd).toBe(-1);
  });

  it('averages the three trend checks into one group', () => {
    const c = classify({ ...base, close: 130, sma50: 105.5, macdHist: [-0.1, -0.2, -0.3, -0.4] });
    expect(c.trendParts).toEqual({ sma200: 1, cross: 0.5, macd: -1 });
    expect(c.signals.trend).toBe(0.17);
  });

  it('uses whatever trend checks have data, and has no trend with none', () => {
    expect(classify({ ...base, sma50: null, sma200: null, macdHist: [0.1, 0.2, 0.3, 0.4] }).signals.trend).toBe(1);
    expect(classify({ ...base, sma50: null, sma200: null, macdHist: null }).signals.trend).toBeNull();
  });
});

describe('classify: strength vs Bitcoin', () => {
  it('grades the 90-day return gap: neutral within ±5 points, full at ±50', () => {
    expect(classify({ ...base, return90d: 14, btcReturn90d: 10 }).signals.strength).toBe(0);
    expect(classify({ ...base, return90d: 37.5, btcReturn90d: 0 }).signals.strength).toBe(0.72);
    expect(classify({ ...base, return90d: -60, btcReturn90d: 0 }).signals.strength).toBe(-1);
  });

  it('is missing without Bitcoin’s return or the coin’s own 90 days', () => {
    expect(classify({ ...base, btcReturn90d: null }).signals.strength).toBeNull();
    expect(classify({ ...base, return90d: null }).signals.strength).toBeNull();
  });
});

describe('classify: RSI depends on the trend', () => {
  const up = { ...base, close: 130 };
  const down = { ...base, close: 70 };
  it('counts oversold as bullish in an uptrend or with no clear trend, not in a downtrend', () => {
    expect(classify({ ...up, rsi: 25 }).signals.rsi).toBe(1);
    expect(classify({ ...base, rsi: 25 }).signals.rsi).toBe(1);
    expect(classify({ ...base, sma200: null, rsi: 25 }).signals.rsi).toBe(1);
    expect(classify({ ...down, rsi: 25 }).signals.rsi).toBe(0);
  });

  it('counts overbought as bearish in a downtrend or with no clear trend, not in an uptrend', () => {
    expect(classify({ ...down, rsi: 75 }).signals.rsi).toBe(-1);
    expect(classify({ ...base, rsi: 75 }).signals.rsi).toBe(-1);
    expect(classify({ ...up, rsi: 75 }).signals.rsi).toBe(0);
  });

  it('is neutral between 30 and 70', () => {
    expect(classify({ ...base, rsi: 30 }).signals.rsi).toBe(0);
    expect(classify({ ...base, rsi: 70 }).signals.rsi).toBe(0);
  });
});

describe('classify: volume', () => {
  it('only counts volume when it is unusually high, in the direction of the 7-day move', () => {
    expect(classify({ ...base, volumeRatio: 1.5, return7d: 4 }).signals.volume).toBe(1);
    expect(classify({ ...base, volumeRatio: 1.5, return7d: -4 }).signals.volume).toBe(-1);
    expect(classify({ ...base, volumeRatio: 1.2, return7d: 9 }).signals.volume).toBe(0);
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
  it('scores all-bullish as +100 with high agreement', () => {
    expect(combine(groups({ trend: 1, strength: 1, rsi: 1, volume: 1 }), base)).toEqual({
      score: 100,
      label: 'Strong bullish signals',
      tone: 'bullish',
      agreement: 'High',
      cautions: [],
    });
  });

  it('weights groups and keeps their strength: trend 45 × 0.5 + strength 25 against RSI 15', () => {
    // (22.5 + 25 − 15) / 100 = 32.5 → 33; two of three clear readings agree.
    expect(combine(groups({ trend: 0.5, strength: 1, rsi: -1 }), base)).toMatchObject({ score: 33, tone: 'bullish', agreement: 'Medium' });
  });

  it('rates agreement Low when fewer than half the clear readings point the overall way', () => {
    // Trend alone carries the score (45 × 0.6 − 25 × 0.3 − 15 = 4.5 → mixed); for a mixed score, agreement is the share of neutral groups.
    expect(combine(groups({ trend: 0.6, strength: -0.3, rsi: -1, volume: 0 }), base)).toMatchObject({ label: 'Mixed / neutral', agreement: 'Low' });
  });

  it('Fear & Greed never changes the score', () => {
    const g = groups({ trend: 1, strength: 0.4 });
    expect(combine(g, { ...base, fearGreed: 10 })!.score).toBe(combine(g, { ...base, fearGreed: 90 })!.score);
  });

  it('rescales over the groups that had data, with a caution for fewer than 3', () => {
    // Trend 45 + volume 15, both bullish: 100, all agree.
    const r = combine(groups({ trend: 1, strength: null, rsi: null, volume: 1 }), base)!;
    expect(r.score).toBe(100);
    expect(r.agreement).toBe('High');
    expect(r.cautions).toEqual(['fewChecks']);
  });

  it('gives no rating without a trend reading or with only one group', () => {
    expect(combine(groups({ trend: null }), base)).toBeNull();
    expect(combine(groups({ trend: 1, strength: null, rsi: null, volume: null }), base)).toBeNull();
  });

  it('lists cautions for high volatility and thin trading without changing the agreement', () => {
    const g = groups({ trend: 1, strength: 1, rsi: 1, volume: 1 });
    expect(combine(g, { ...base, volatility: 95 })).toMatchObject({ agreement: 'High', cautions: ['volatile'] });
    expect(combine(g, { ...base, volatility: 95, turnover: 0.5 })).toMatchObject({ agreement: 'High', cautions: ['volatile', 'thin'] });
  });

  it('lists a caution when the market leans against the reading', () => {
    const bull = groups({ trend: 1, strength: 1, rsi: 1, volume: 1 });
    const bear = groups({ trend: -1, strength: -1, rsi: -1, volume: -1 });
    expect(combine(bull, { ...base, fearGreed: 80 })!.cautions).toEqual(['greed']);
    expect(combine(bull, { ...base, breadth: 20 })!.cautions).toEqual(['weakMarket']);
    expect(combine(bull, { ...base, fearGreed: 80, breadth: 20 })!.cautions).toEqual(['greed', 'weakMarket']);
    expect(combine(bear, { ...base, fearGreed: 20 })!.cautions).toEqual(['fear']);
    expect(combine(bear, { ...base, breadth: 80 })!.cautions).toEqual(['strongMarket']);
    // A crowd leaning the same way as a bearish reading isn't a caution.
    expect(combine(bear, { ...base, fearGreed: 80, breadth: 20 })).toMatchObject({ agreement: 'High', cautions: [] });
  });

  it('rates a mostly-neutral picture as mixed with high agreement', () => {
    expect(combine(groups({}), base)).toMatchObject({ score: 0, label: 'Mixed / neutral', agreement: 'High' });
  });
});

describe('computeMetrics / computeSignal', () => {
  const ctx = { fearGreed: 50, btcReturn90d: 0, breadth: 50, turnover: 5, athChangePct: -10 };

  it('rates a steady uptrend that beats Bitcoin, with rising volume, as bullish', () => {
    const closes = Array.from({ length: 365 }, (_, i) => 100 * 1.004 ** i + Math.sin(i) * 0.5);
    const s = computeSignal('coin', daily(closes, (i) => (i > 357 ? 200 : 100)), 'binance', ctx, NOW)!;
    expect(s.trendParts.sma200).toBeGreaterThan(0.5);
    expect(s.trendParts.cross).toBe(1);
    expect(s.signals.strength).toBeGreaterThan(0.5);
    expect(s.signals.volume).toBe(1);
    expect(s.tone).toBe('bullish');
    expect(s.metrics.days).toBe(365);
    expect(s.metrics.return90d).toBeCloseTo((1.004 ** 90 - 1) * 100, 0);
    expect(s.metrics.turnover).toBe(5);
  });

  it('never measures Bitcoin against itself', () => {
    const closes = Array.from({ length: 365 }, (_, i) => 100 + i);
    expect(computeSignal('bitcoin', daily(closes), 'binance', ctx, NOW)!.signals.strength).toBeNull();
  });

  it('leaves out the still-open daily candle when measuring volume', () => {
    const closes = Array(40).fill(100);
    // Huge volume only on today's open candle should not count.
    const m = computeMetrics(daily(closes, (i) => (i === 39 ? 1e9 : 100)), {}, NOW)!;
    expect(m.volumeRatio).toBe(1);
  });

  it('marks long-term checks as missing for young coins', () => {
    const m = computeMetrics(daily(Array.from({ length: 60 }, (_, i) => 100 + i)), ctx, NOW)!;
    expect(m.sma200).toBeNull();
    expect(m.return90d).toBeNull();
    const c = classify(m);
    expect(c.trendParts.sma200).toBeNull();
    expect(c.trendParts.cross).toBeNull();
    expect(c.trendParts.macd).not.toBeNull();
    expect(c.signals.strength).toBeNull();
  });

  it('returns no signal without enough data', () => {
    expect(computeSignal('x', daily([1, 2, 3]), 'binance', {}, NOW)).toBeNull();
  });
});

describe('marketContext', () => {
  const item = (id: string, close: number, sma200: number | null, return90d = 0) =>
    ({ id, metrics: { ...base, close, sma200, return90d } }) as CoinSignal;

  it('takes Bitcoin’s 90-day return and the share of coins above their 200-day average', () => {
    const items: Record<string, CoinSignal> = { bitcoin: item('bitcoin', 110, 100, 25), young: item('young', 5, null) };
    for (let i = 0; i < 11; i++) items[`c${i}`] = item(`c${i}`, i < 3 ? 110 : 90, 100);
    // 4 of 12 coins with a 200-day average are above it.
    expect(marketContext(items)).toEqual({ btcReturn90d: 25, breadth: 33, breadthCoins: 12 });
  });

  it('has no breadth with fewer than 10 coins, and no Bitcoin return before Bitcoin is rated', () => {
    expect(marketContext({ a: item('a', 110, 100) })).toEqual({ btcReturn90d: null, breadth: null, breadthCoins: 1 });
  });
});

describe('helpers', () => {
  it('picks the heaviest agreeing groups as top reasons', () => {
    const s = computeSignal('c', daily(Array.from({ length: 365 }, (_, i) => 100 + i)), 'binance', { btcReturn90d: 0 }, NOW)!;
    expect(topReasons(s)[0]).toBe('trend');
  });

  it('weighs a strong strength reading above a weak trend', () => {
    expect(topReasons({ tone: 'bullish', signals: groups({ trend: 0.3, strength: 1 }) })).toEqual(['strength', 'trend']);
  });

  it('knows stablecoins and gold tokens by symbol', () => {
    expect(isPeggedSymbol('usdt')).toBe(true);
    expect(isPeggedSymbol('PAXG')).toBe(true);
    expect(isPeggedSymbol('BTC')).toBe(false);
  });
});

describe('hasPeggedPrice', () => {
  const wiggle = (n: number, size: number) => daily(Array.from({ length: n }, (_, i) => 100 * (1 + (i % 2 ? size : -size))));

  it('catches a price that barely moves, like a tokenised fund or a euro token', () => {
    expect(hasPeggedPrice(daily(Array.from({ length: 120 }, (_, i) => 1.08 + i * 0.0001)))).toBe(true);
    // Daily swings of ±0.2% (about 7% a year, like the euro against the dollar).
    expect(hasPeggedPrice(wiggle(120, 0.002))).toBe(true);
  });

  it('leaves real coins alone, even in a quiet stretch', () => {
    // ±1% a day is about 38% a year: a calm month for Bitcoin.
    expect(hasPeggedPrice(wiggle(120, 0.01))).toBe(false);
  });

  it('needs at least a month of prices to decide', () => {
    expect(hasPeggedPrice(daily(Array(30).fill(1)))).toBe(false);
    expect(hasPeggedPrice(daily(Array(31).fill(1)))).toBe(true);
  });
});
