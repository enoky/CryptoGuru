import { describe, expect, it } from 'vitest';
import { DAY, readings, type Reading } from '../../shared/backtest';
import type { Metrics } from '../../shared/signals';
import { BINANCE_BASE } from '../../shared/sources/binance';
import type { Candle } from '../../shared/types';
import { compare, meanOfYears, positiveYears, prepare, relSpread, spread, toMarkdown, type CoinInput } from '../research/compare';
import { fullHistory, HISTORY_START } from '../research/history';
import { v1Label } from '../research/v1';
import { mockFetch } from '../helpers/mockFetch';

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

const reading = (t: number, label: Reading['label'], ret: number, over: Partial<Metrics> = {}, score = 0): Reading => ({
  t,
  metrics: metrics(over),
  signals: { trend: 0, strength: null, rsi: 0, volume: 0 },
  label,
  score,
  agreement: label && label !== 'No clear trend' ? 'High' : 'Medium',
  returns: { 7: ret, 30: ret },
});

const at = (y: number, d = 0) => Date.UTC(y, 0, 10) + d * DAY;

/** Twelve coins on the same days: enough for market averages and rankings. */
function market(days: number[], f: (coin: number, t: number) => { label: Reading['label']; ret: number; score?: number; r90?: number }): CoinInput[] {
  return Array.from({ length: 12 }, (_, k) => ({
    id: k === 0 ? 'bitcoin' : `c${k}`,
    candles: [],
    readings: days.map((t) => {
      const x = f(k, t);
      return reading(t, x.label, x.ret, { return90d: x.r90 ?? 0 }, x.score ?? 0);
    }),
  }));
}

describe('the frozen pre-Phase-4 rules', () => {
  it('scored six checks, Fear & Greed included', () => {
    expect(v1Label(metrics())).toBe('No clear trend');
    // Extreme fear alone (15 of 100) tipped every otherwise-neutral coin to "Leaning bullish":
    // one reason Fear & Greed is now context only.
    expect(v1Label(metrics({ fearGreed: 10 }))).toBe('Uptrend');
    expect(v1Label(metrics({ fearGreed: 10, close: 90 }))).toBe('No clear trend');
  });
});

describe('prepare', () => {
  it('averages the coins’ forward returns per day and ranks them into fifths', () => {
    const coins = market([at(2020)], (k) => ({ label: null, ret: k / 100, score: k }));
    const m = prepare(coins).market.get(Math.floor(at(2020) / DAY))!;
    expect(m.forward[30]).toBeCloseTo(5.5 / 100, 10);
    // 12 coins: the top 2 and bottom 2 by score.
    expect([...m.ranks.score].filter(([, d]) => d === 1).map(([id]) => id).sort()).toEqual(['c10', 'c11']);
    expect([...m.ranks.score].filter(([, d]) => d === -1).map(([id]) => id).sort()).toEqual(['bitcoin', 'c1']);
  });

  it('has no market average or ranking with fewer than 10 coins', () => {
    const coins = market([at(2020)], () => ({ label: null, ret: 0.1 })).slice(0, 9);
    const m = prepare(coins).market.get(Math.floor(at(2020) / DAY))!;
    expect(m.forward[30]).toBeNull();
    expect(m.ranks.score.size).toBe(0);
  });

  it('measures Bitcoin’s efficiency: 1 for a straight line, near 0 for a zigzag', () => {
    const line: Candle[] = Array.from({ length: 40 }, (_, i) => ({ t: at(2020, i), o: 1, h: 1, l: 1, c: 100 + i, v: 1 }));
    const zig: Candle[] = line.map((c, i) => ({ ...c, c: i % 2 ? 110 : 100 }));
    const day = Math.floor(at(2020, 39) / DAY);
    const coin = (candles: Candle[]): CoinInput => ({ id: 'bitcoin', candles, readings: [reading(at(2020, 39), null, 0)] });
    expect(prepare([coin(line)]).market.get(day)!.btcEfficiency).toBeCloseTo(1, 10);
    expect(prepare([coin(zig)]).market.get(day)!.btcEfficiency).toBeLessThan(0.1);
  });
});

describe('compare', () => {
  // 2021 (tuning): bullish calls rise 10%, bearish fall 10%. 2024 (held-out): the reverse.
  const coins = market([at(2021), at(2021, 1), at(2024), at(2024, 1)], (k, t) => {
    const bull = k % 2 === 0;
    const good = new Date(t).getUTCFullYear() === 2021;
    return { label: bull ? 'Uptrend' : 'Downtrend', ret: (bull === good ? 0.1 : -0.1) + k / 1000, score: bull ? 30 : -30, r90: bull ? 5 : -5 };
  });
  const c = compare(coins, ['Gone'], ['Fund']);

  it('keeps each year, the tuning years and the held-out years apart', () => {
    expect(c.years).toEqual(['2021', '2024']);
    expect(spread(c.stats.current[30]['2021'])).toBeGreaterThan(19);
    expect(spread(c.stats.current[30]['2024'])).toBeLessThan(-19);
    expect(c.stats.current[30].tuning.days).toBe(24);
    expect(c.stats.current[30].heldout.days).toBe(24);
    // +19.9 in 2021 and −20.1 in 2024 (the small per-coin offsets favour the odd, bearish coins).
    expect(meanOfYears(c, 'current', 30, ['2021', '2024'], spread)).toBeCloseTo(-0.1, 6);
    expect(positiveYears(c, 'current', 30, ['2021', '2024'], spread)).toEqual([1, 2]);
  });

  it('measures returns against the market average', () => {
    const s = c.stats.current[30]['2021'];
    // Half the coins rise 10%, half fall 10%: the market is about flat, so relative ≈ absolute.
    expect(relSpread(s)).toBeCloseTo(spread(s)!, 0);
    expect(s.bull.beat).toBe(s.bull.n);
  });

  it('picks candidate settings on the tuning years only', () => {
    expect(c.picked.strict).toMatch(/^strict/);
    expect(c.picked.rank).toMatch(/^rank-/);
    expect(c.picked.choppy).toMatch(/^choppy/);
    // Every strict level (25, 30, 40) gives the same 2021 result here; the first wins the tie.
    expect(c.picked.strict).toBe('strict25');
  });

  it('writes the report', () => {
    const md = toMarkdown(c, 0);
    expect(md).toContain('tuning years 2021–2021, held-out years 2024–2024');
    expect(md).toContain('## Up or down? Next 30 days');
    expect(md).toContain('## Against the market, next 30 days');
    expect(md).toContain('| 2024 (held-out) |');
    expect(md).toContain('Pegged (price barely moves), not rated or tested: Fund.');
    expect(md).toContain('Left out (no Binance history, or too little of it): Gone.');
  });

  it('runs end to end on real readings', () => {
    const candles: Candle[] = Array.from({ length: 400 }, (_, i) => {
      const p = 100 * Math.exp(Math.sin(i / 25) * 0.3 + i * 0.001);
      return { t: at(2021, i), o: p, h: p, l: p, c: p, v: 100 };
    });
    const coin = { id: 'x', candles, readings: readings('x', candles, null, null) };
    const r = compare([coin]);
    expect(r.coins).toEqual(['x']);
    // One coin: no market average, so nothing is scored, but nothing breaks.
    expect(r.stats.current).toBeUndefined();
  });
});

describe('fullHistory', () => {
  const kline = (t: number, c: number) => [t, String(c), String(c), String(c), String(c), '1', 0];

  it('pages forward 1,000 days at a time from 2017 until the data runs out', async () => {
    const start = (u: string) => Number(new URL(u).searchParams.get('startTime'));
    const f = mockFetch({
      [`${BINANCE_BASE}/klines`]: (u) => {
        const s = start(u);
        const n = s === HISTORY_START ? 1000 : 250;
        return Array.from({ length: n }, (_, i) => kline(s + i * DAY, 100));
      },
    });
    const candles = (await fullHistory(f, 'BTC', 100, Date.UTC(2030, 0, 1)))!;
    expect(f.calls).toHaveLength(2);
    expect(start(f.calls[1])).toBe(HISTORY_START + 1000 * DAY);
    expect(candles).toHaveLength(1250);
  });

  it('rejects the same ticker for a different coin, and coins with no pair', async () => {
    const f = mockFetch({ [`${BINANCE_BASE}/klines`]: () => Array.from({ length: 50 }, (_, i) => kline(HISTORY_START + i * DAY, 5)) });
    expect(await fullHistory(f, 'ABC', 100, Date.UTC(2030, 0, 1))).toBeNull();
    expect(await fullHistory(f, 'USDT', 1, Date.UTC(2030, 0, 1))).toBeNull();
  });
});
