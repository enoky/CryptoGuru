import { describe, expect, it } from 'vitest';
import { DAY, readings, type Reading } from '../../shared/backtest';
import type { Metrics } from '../../shared/signals';
import type { Candle } from '../../shared/types';
import { compare, directions, spread, splitDate, toMarkdown } from '../research/compare';
import { v1Label } from '../research/v1';

const metrics = (over: Partial<Metrics> = {}): Metrics => ({
  close: 100,
  days: 365,
  sma50: 100,
  sma200: 100,
  macdHist: [0, 0, 0, 0],
  rsi: 50,
  volumeRatio: 1,
  return7d: 0,
  return90d: 0,
  volatility: 50,
  btcReturn90d: null,
  fearGreed: 50,
  breadth: null,
  turnover: null,
  athChangePct: null,
  ...over,
});

const reading = (t: number, label: Reading['label'], ret: number, over: Partial<Metrics> = {}): Reading => ({
  t,
  metrics: metrics(over),
  signals: { trend: 0, strength: null, rsi: 0, volume: 0 },
  label,
  agreement: label && !label.startsWith('Mixed') ? 'High' : 'Medium',
  returns: { 7: ret, 30: ret },
});

describe('the frozen pre-Phase-4 rules', () => {
  it('scored six checks, Fear & Greed included', () => {
    expect(v1Label(metrics())).toBe('Mixed / neutral');
    // Extreme fear alone (15 of 100) tipped every otherwise-neutral coin to "Leaning bullish":
    // one reason Fear & Greed is now context only.
    expect(v1Label(metrics({ fearGreed: 10 }))).toBe('Leaning bullish');
    expect(v1Label(metrics({ fearGreed: 10, close: 90 }))).toBe('Mixed / neutral');
    expect(v1Label(metrics({ close: 130, sma50: 110, macdHist: [1, 2, 3, 4], rsi: 20, volumeRatio: 2, return7d: 5, fearGreed: 10 }))).toBe(
      'Strong bullish signals',
    );
  });
});

describe('compare', () => {
  it('reads each rule’s direction', () => {
    expect(directions(reading(0, 'Leaning bearish', 0, { return90d: 12 }))).toEqual({ current: -1, v1: 0, momentum: 1, always: 1 });
  });

  it('splits at the median date and counts calls, hits and spread per half', () => {
    const rs = [
      reading(1 * DAY, 'Leaning bullish', 0.1, { return90d: 5 }),
      reading(2 * DAY, 'Leaning bearish', -0.1, { return90d: -5 }),
      reading(3 * DAY, 'Leaning bullish', -0.2, { return90d: 5 }),
      reading(4 * DAY, 'Mixed / neutral', 0.3, { return90d: -5 }),
    ];
    expect(splitDate([rs])).toBe(3 * DAY);
    const c = compare([{ id: 'x', readings: rs }], ['Gone'], ['Fund']);
    const older = c.rules.older[30].current;
    expect(older).toMatchObject({ days: 2, calls: 2, right: 2 });
    expect(spread(older)).toBeCloseTo(20, 10);
    const newer = c.rules.newer[30];
    expect(newer.current).toMatchObject({ days: 2, calls: 1, right: 0 });
    expect(newer.momentum).toMatchObject({ calls: 2, right: 0 });
    expect(newer.always).toMatchObject({ calls: 2, right: 1 });
    expect(c.agreement.older[7].High).toEqual({ n: 2, right: 2 });
    const md = toMarkdown(c, 0);
    expect(md).toContain('## Next 30 days, newer half');
    expect(md).toContain('| Current rules (Phase 4) | 2 (100.0%) | 100.0% | +10.00% | −10.00% | +20.00 pts |');
    expect(md).toContain('Left out (no exchange history, or too little of it): Gone.');
    expect(md).toContain('Pegged (price barely moves), not rated or tested: Fund.');
  });

  it('runs end to end on real readings', () => {
    const candles: Candle[] = Array.from({ length: 400 }, (_, i) => {
      const c = 100 * Math.exp(Math.sin(i / 25) * 0.3 + i * 0.001);
      return { t: i * DAY, o: c, h: c, l: c, c, v: 100 };
    });
    const c = compare([{ id: 'x', readings: readings('x', candles, null, null) }]);
    expect(c.coins).toEqual(['x']);
    expect(c.rules.older[7].always.days + c.rules.newer[7].always.days).toBe(400 - 199 - 7);
  });
});
