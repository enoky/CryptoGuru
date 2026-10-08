import { AGREEMENTS, dayKey, HORIZONS, type Horizon, type Reading } from '../../shared/backtest';
import { BTC_ID, GROUPS, dirOf, type SignalLabel } from '../../shared/signals';
import type { Candle } from '../../shared/types';
import { v1Label } from './v1';

/**
 * Compares the live rules with the pre-Phase-4 rules, simple baselines and
 * Phase 5 candidates on the same coin-days, year by year (PLAN.md §5,
 * Phase 5). Any choice between candidates looks only at the tuning years
 * (up to TUNING_END_YEAR); later years are the held-out test.
 */

export const TUNING_END_YEAR = 2022;
/** Market averages and cross-coin rankings need at least this many coins that day. */
export const MIN_COINS = 10;
export const CHOPPY_LEVELS = [0.1, 0.15, 0.2, 0.25, 0.3] as const;
export const STRICT_LEVELS = [25, 30, 40] as const;

type Dir = 1 | 0 | -1;

/** What is known about the market on one day, from data up to that day (plus forward returns, for scoring only). */
export interface MarketDay {
  /** Equal-weighted average forward return of the coins that day, per horizon. */
  forward: Record<Horizon, number | null>;
  /** Bitcoin's 30-day efficiency ratio: net move ÷ sum of daily moves (0 = zigzag, 1 = straight line). */
  btcEfficiency: number | null;
  btcAbove200: boolean | null;
  /** Cross-coin rank of each coin that day: +1 top fifth, −1 bottom fifth, by score / 7, 30, 90-day return. */
  ranks: Record<RankKey, Map<string, Dir>>;
}

export const RANK_KEYS = ['score', 'ret7', 'ret30', 'ret90'] as const;
export type RankKey = (typeof RANK_KEYS)[number];

export interface CoinDay {
  id: string;
  r: Reading;
  /** 30-day return, %, from the coin's own candles. */
  ret30: number | null;
}

export interface Rule {
  key: string;
  name: string;
  family: 'baseline' | 'choppy' | 'strict' | 'rank';
  dir: (d: CoinDay, m: MarketDay | undefined) => Dir | null;
}

const labelDir = (l: SignalLabel | null): Dir | null => (l == null ? null : l.includes('bullish') ? 1 : l.includes('bearish') ? -1 : 0);
const scoreDir = (s: number | null, cut: number): Dir | null => (s == null ? null : s >= cut ? 1 : s <= -cut ? -1 : 0);

export const RULES: Rule[] = [
  { key: 'current', name: 'Current rules', family: 'baseline', dir: (d) => labelDir(d.r.label) },
  { key: 'v1', name: 'Rules before Phase 4', family: 'baseline', dir: (d) => labelDir(v1Label(d.r.metrics)) },
  { key: 'momentum', name: '90-day momentum', family: 'baseline', dir: (d) => (d.r.metrics.return90d == null ? null : (Math.sign(d.r.metrics.return90d) as Dir)) },
  { key: 'always', name: 'Always bullish', family: 'baseline', dir: () => 1 },
  ...CHOPPY_LEVELS.map(
    (x): Rule => ({
      key: `choppy${x}`,
      name: `Current, neutral when Bitcoin's efficiency < ${x}`,
      family: 'choppy',
      dir: (d, m) => {
        const base = labelDir(d.r.label);
        return base && m?.btcEfficiency != null && m.btcEfficiency < x ? 0 : base;
      },
    }),
  ),
  ...STRICT_LEVELS.map((c): Rule => ({ key: `strict${c}`, name: `Current, bullish/bearish only beyond ±${c}`, family: 'strict', dir: (d) => scoreDir(d.r.score, c) })),
  ...RANK_KEYS.map(
    (k): Rule => ({
      key: `rank-${k}`,
      name: { score: 'Top/bottom fifth by score', ret7: 'Top/bottom fifth by 7-day return', ret30: 'Top/bottom fifth by 30-day return', ret90: 'Top/bottom fifth by 90-day return' }[k],
      family: 'rank',
      dir: (d, m) => m?.ranks[k].get(d.id) ?? null,
    }),
  ),
];

export interface Stats {
  days: number;
  calls: number;
  right: number;
  bull: { n: number; sum: number; rose: number; rel: number; beat: number };
  bear: { n: number; sum: number; fell: number; rel: number; lagged: number };
}

const emptyStats = (): Stats => ({
  days: 0,
  calls: 0,
  right: 0,
  bull: { n: 0, sum: 0, rose: 0, rel: 0, beat: 0 },
  bear: { n: 0, sum: 0, fell: 0, rel: 0, lagged: 0 },
});

/** Average return after bullish calls minus after bearish calls, percentage points; null without both. */
export const spread = (s: Stats) => (s.bull.n && s.bear.n ? (s.bull.sum / s.bull.n - s.bear.sum / s.bear.n) * 100 : null);
/** The same, for returns relative to the market average. */
export const relSpread = (s: Stats) => (s.bull.n && s.bear.n ? (s.bull.rel / s.bull.n - s.bear.rel / s.bear.n) * 100 : null);

const efficiency = (closes: number[]) => {
  let path = 0;
  for (let i = 1; i < closes.length; i++) path += Math.abs(closes[i] - closes[i - 1]);
  return path > 0 ? Math.abs(closes[closes.length - 1] - closes[0]) / path : null;
};

/** Top fifth +1, bottom fifth −1, by value; empty with fewer than MIN_COINS. */
function fifths(values: { id: string; v: number }[]): Map<string, Dir> {
  const out = new Map<string, Dir>();
  if (values.length < MIN_COINS) return out;
  const sorted = [...values].sort((a, b) => b.v - a.v);
  const n = Math.max(1, Math.floor(sorted.length / 5));
  sorted.forEach((x, i) => out.set(x.id, i < n ? 1 : i >= sorted.length - n ? -1 : 0));
  return out;
}

export interface CoinInput {
  id: string;
  candles: Candle[];
  readings: Reading[];
}

export function prepare(coins: CoinInput[]): { days: Map<number, CoinDay[]>; market: Map<number, MarketDay> } {
  const days = new Map<number, CoinDay[]>();
  for (const c of coins) {
    const closeByDay = new Map(c.candles.map((k) => [dayKey(k.t), k.c]));
    for (const r of c.readings) {
      const d = dayKey(r.t);
      const then = closeByDay.get(d - 30);
      const now = closeByDay.get(d);
      const ret30 = then && now ? (now / then - 1) * 100 : null;
      const list = days.get(d) ?? [];
      list.push({ id: c.id, r, ret30 });
      days.set(d, list);
    }
  }

  const btc = coins.find((c) => c.id === BTC_ID)?.candles ?? [];
  const btcIndex = new Map(btc.map((k, i) => [dayKey(k.t), i]));
  const market = new Map<number, MarketDay>();
  for (const [d, list] of days) {
    const forward = {} as Record<Horizon, number | null>;
    for (const h of HORIZONS) {
      const rets = list.map((x) => x.r.returns[h]).filter((x): x is number => x != null);
      forward[h] = rets.length >= MIN_COINS ? rets.reduce((a, b) => a + b, 0) / rets.length : null;
    }
    const i = btcIndex.get(d);
    const btcEfficiency = i != null && i >= 30 ? efficiency(btc.slice(i - 30, i + 1).map((k) => k.c)) : null;
    let btcAbove200: boolean | null = null;
    if (i != null && i >= 199) {
      const avg = btc.slice(i - 199, i + 1).reduce((a, k) => a + k.c, 0) / 200;
      btcAbove200 = btc[i].c > avg;
    }
    const pick = (f: (x: CoinDay) => number | null) => list.flatMap((x) => (f(x) == null ? [] : [{ id: x.id, v: f(x)! }]));
    const ranks: Record<RankKey, Map<string, Dir>> = {
      score: fifths(pick((x) => x.r.score)),
      ret7: fifths(pick((x) => x.r.metrics.return7d)),
      ret30: fifths(pick((x) => x.ret30)),
      ret90: fifths(pick((x) => x.r.metrics.return90d)),
    };
    market.set(d, { forward, btcEfficiency, btcAbove200, ranks });
  }
  return { days, market };
}

export type Bucket = string; // a year ("2021"), 'tuning', 'heldout', 'tuning-up', 'heldout-down', …

export interface Comparison {
  coins: string[];
  missing: string[];
  pegged: string[];
  from: number;
  to: number;
  years: string[];
  /** rule key → horizon → bucket → stats */
  stats: Record<string, Record<Horizon, Record<Bucket, Stats>>>;
  /** Current rules' bullish/bearish calls by agreement: horizon → bucket → level → hits. */
  agreement: Record<Horizon, Record<Bucket, Record<string, { n: number; right: number }>>>;
  /** For each candidate family, the setting picked on the tuning years. */
  picked: Record<'choppy' | 'strict' | 'rank', string>;
  /** Current rules' groups, held-out 30 days: share of bullish readings that beat the market, bearish that lagged (see addGroupHits). */
  groupHits?: Record<string, { bull: string; bear: string }>;
}

const yearOf = (t: number) => String(new Date(t).getUTCFullYear());
const isTuning = (year: string) => Number(year) <= TUNING_END_YEAR;

export function compare(coins: CoinInput[], missing: string[] = [], pegged: string[] = []): Comparison {
  const { days, market } = prepare(coins);
  const out: Comparison = {
    coins: coins.filter((c) => c.readings.length).map((c) => c.id),
    missing,
    pegged,
    from: Infinity,
    to: -Infinity,
    years: [],
    stats: {},
    agreement: { 7: {}, 30: {} },
    picked: { choppy: '', strict: '', rank: '' },
  };
  const at = (rule: string, h: Horizon, b: Bucket) => {
    const byH = (out.stats[rule] ??= { 7: {}, 30: {} } as Record<Horizon, Record<Bucket, Stats>>);
    return (byH[h][b] ??= emptyStats());
  };
  const years = new Set<string>();
  for (const [d, list] of days) {
    const m = market.get(d);
    const t = d * 86_400_000;
    out.from = Math.min(out.from, t);
    out.to = Math.max(out.to, t);
    const year = yearOf(t);
    years.add(year);
    const split = isTuning(year) ? 'tuning' : 'heldout';
    const phase = m?.btcAbove200 == null ? null : m.btcAbove200 ? 'up' : 'down';
    const buckets: Bucket[] = [year, split, ...(phase ? [`${split}-${phase}`] : [])];
    for (const x of list) {
      for (const h of HORIZONS) {
        const ret = x.r.returns[h];
        const mkt = m?.forward[h];
        if (ret == null || mkt == null) continue;
        const rel = ret - mkt;
        for (const rule of RULES) {
          const dir = rule.dir(x, m);
          if (dir == null) continue;
          for (const b of buckets) {
            const s = at(rule.key, h, b);
            s.days++;
            if (dir === 1) {
              s.bull.n++;
              s.bull.sum += ret;
              s.bull.rel += rel;
              if (ret > 0) s.bull.rose++;
              if (rel > 0) s.bull.beat++;
            } else if (dir === -1) {
              s.bear.n++;
              s.bear.sum += ret;
              s.bear.rel += rel;
              if (ret < 0) s.bear.fell++;
              if (rel < 0) s.bear.lagged++;
            }
            if (dir !== 0) {
              s.calls++;
              if (Math.sign(ret) === dir) s.right++;
            }
          }
        }
        const cur = labelDir(x.r.label);
        if (x.r.agreement && (cur === 1 || cur === -1)) {
          for (const b of buckets) {
            const a = ((out.agreement[h][b] ??= {})[x.r.agreement] ??= { n: 0, right: 0 });
            a.n++;
            if (Math.sign(ret) === cur) a.right++;
          }
        }
      }
    }
  }
  out.years = [...years].sort();
  const tuningYears = out.years.filter(isTuning);
  for (const family of ['choppy', 'strict', 'rank'] as const) {
    const metric = family === 'rank' ? relSpread : spread;
    let best = { key: '', value: -Infinity };
    for (const rule of RULES.filter((r) => r.family === family)) {
      const v = meanOfYears(out, rule.key, 30, tuningYears, metric);
      if (v != null && v > best.value) best = { key: rule.key, value: v };
    }
    out.picked[family] = best.key;
  }
  return out;
}

/** The average of the yearly values, so each year (each market) counts equally. */
export function meanOfYears(c: Comparison, rule: string, h: Horizon, years: string[], metric: (s: Stats) => number | null): number | null {
  const vals = years.map((y) => c.stats[rule]?.[h][y]).map((s) => (s ? metric(s) : null)).filter((v): v is number => v != null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/** How many of the given years had a positive value, out of those with one. */
export function positiveYears(c: Comparison, rule: string, h: Horizon, years: string[], metric: (s: Stats) => number | null): [number, number] {
  const vals = years.map((y) => c.stats[rule]?.[h][y]).map((s) => (s ? metric(s) : null)).filter((v): v is number => v != null);
  return [vals.filter((v) => v > 0).length, vals.length];
}

const pts = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`);
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');
const date = (t: number) => new Date(t).toISOString().slice(0, 10);
const nameOf = (key: string) => RULES.find((r) => r.key === key)?.name ?? key;

export function toMarkdown(c: Comparison, now = Date.now()): string {
  const L: string[] = [];
  const tuning = c.years.filter(isTuning);
  const held = c.years.filter((y) => !isTuning(y));
  const main = ['current', 'v1', 'momentum', c.picked.choppy, c.picked.strict].filter(Boolean);
  const ranks = RULES.filter((r) => r.family === 'rank').map((r) => r.key);

  L.push('# Signal backtest: all rated coins', '');
  L.push(
    `Run ${date(now)} · ${c.coins.length} coins · ${date(c.from)} to ${date(c.to)} · tuning years ${tuning[0] ?? '—'}–${tuning.at(-1) ?? '—'}, held-out years ${held[0] ?? '—'}–${held.at(-1) ?? '—'}.`,
    '',
  );
  L.push(
    'Every coin-day replays the rules on data up to that day only. **Spread** is the average return after bullish calls minus after bearish calls, in percentage points: above 0 means the calls told better periods from worse ones. It is averaged **year by year**, so each market counts equally. **Against the market** measures each return minus the average of all coins that day, which removes the whole market rising or falling. Candidate settings (choppy-market filter, stricter bands, ranking) were picked on the tuning years only; the held-out years are the test.',
    '',
  );

  for (const h of HORIZONS) {
    L.push(`## Up or down? Next ${h} days`, '');
    L.push('| Rules | Spread, tuning years | Spread, held-out years | Held-out years positive | Right, held-out | Calls, held-out |', '|---|---|---|---|---|---|');
    for (const key of [...main, 'always']) {
      const s = c.stats[key]?.[h].heldout ?? emptyStats();
      const [pos, of] = positiveYears(c, key, h, held, spread);
      L.push(
        `| ${nameOf(key)} | ${pts(meanOfYears(c, key, h, tuning, spread))} | ${pts(meanOfYears(c, key, h, held, spread))} | ${of ? `${pos} of ${of}` : '—'} | ${pct(s.right, s.calls)} | ${pct(s.calls, s.days)} of days |`,
      );
    }
    L.push('');
  }

  L.push('## Against the market, next 30 days', '');
  L.push(
    '| Rules | Spread vs market, tuning | Spread vs market, held-out | Held-out years positive | Bullish beat the market (held-out) | Bearish lagged it (held-out) |',
    '|---|---|---|---|---|---|',
  );
  {
    // The yardstick: most coins trail the average, because a few big winners pull it up.
    const any = c.stats.always?.[30].heldout ?? emptyStats();
    L.push(`| Any coin (yardstick) | — | — | — | ${pct(any.bull.beat, any.bull.n)} | ${pct(any.bull.n - any.bull.beat, any.bull.n)} |`);
  }
  for (const key of [...main, ...ranks]) {
    const s = c.stats[key]?.[30].heldout ?? emptyStats();
    const [pos, of] = positiveYears(c, key, 30, held, relSpread);
    L.push(
      `| ${nameOf(key)}${key === c.picked.rank ? ' (picked)' : ''} | ${pts(meanOfYears(c, key, 30, tuning, relSpread))} | ${pts(meanOfYears(c, key, 30, held, relSpread))} | ${of ? `${pos} of ${of}` : '—'} | ${pct(s.bull.beat, s.bull.n)} | ${pct(s.bear.lagged, s.bear.n)} |`,
    );
  }
  L.push('');

  L.push('## Year by year: spread, next 30 days', '');
  const yearRules = [...main, c.picked.rank];
  L.push(`| Year | ${yearRules.map(nameOf).join(' | ')} | Average coin |`, `|---|${yearRules.map(() => '---').join('|')}|---|`);
  for (const y of c.years) {
    const mk = c.stats.always?.[30][y];
    const avgMkt = mk && mk.bull.n ? (mk.bull.sum / mk.bull.n) * 100 : null;
    const cells = yearRules.map((k) => {
      const s = c.stats[k]?.[30][y];
      return pts(s ? (c.picked.rank === k ? relSpread(s) : spread(s)) : null);
    });
    L.push(`| ${y}${isTuning(y) ? '' : ' (held-out)'} | ${cells.join(' | ')} | ${avgMkt == null ? '—' : `${pts(avgMkt)}%`} |`);
  }
  L.push('', `A year shows — when fewer than ${MIN_COINS} of today's coins had 200 days of Binance history, so there's no market average to score against.`);
  L.push('', `The ranking column (${nameOf(c.picked.rank)}) is measured against the market; the others up or down.`, '');

  L.push('## By market phase: spread, next 30 days', '');
  L.push('| Rules | Tuning, Bitcoin above its 200-day | Tuning, below | Held-out, above | Held-out, below |', '|---|---|---|---|---|');
  for (const key of main) {
    const cell = (b: string) => {
      const s = c.stats[key]?.[30][b];
      return s ? pts(spread(s)) : '—';
    };
    L.push(`| ${nameOf(key)} | ${cell('tuning-up')} | ${cell('tuning-down')} | ${cell('heldout-up')} | ${cell('heldout-down')} |`);
  }
  L.push('', 'Pooled within each phase (not year by year).', '');

  L.push('## Candidate settings (picked on the tuning years)', '');
  L.push('| Candidate | Spread, tuning years | Spread, held-out years |', '|---|---|---|');
  for (const r of RULES.filter((r) => r.family !== 'baseline')) {
    const metric = r.family === 'rank' ? relSpread : spread;
    const picked = Object.values(c.picked).includes(r.key) ? ' **(picked)**' : '';
    L.push(`| ${r.name}${r.family === 'rank' ? ' (vs market)' : ''}${picked} | ${pts(meanOfYears(c, r.key, 30, tuning, metric))} | ${pts(meanOfYears(c, r.key, 30, held, metric))} |`);
  }
  L.push('');

  L.push('## Were ratings right more often when the checks agreed? (current rules, next 30 days)', '');
  L.push('| Agreement | Tuning years | Held-out years |', '|---|---|---|');
  for (const a of AGREEMENTS) {
    const cell = (b: string) => {
      const x = c.agreement[30][b]?.[a];
      return x ? `${pct(x.right, x.n)} (${x.n.toLocaleString('en-US')})` : '—';
    };
    L.push(`| ${a} | ${cell('tuning')} | ${cell('heldout')} |`);
  }
  L.push('');

  L.push('## Each check (current rules, held-out years, next 30 days)', '');
  L.push('| Check | When bullish: beat the market | When bearish: lagged it |', '|---|---|---|');
  for (const g of GROUPS) L.push(`| ${g.name} | ${c.groupHits?.[g.key]?.bull ?? '—'} | ${c.groupHits?.[g.key]?.bear ?? '—'} |`);
  L.push('');

  L.push('## Caveats', '');
  L.push(
    '- Neighbouring days overlap (their windows share most days), and the coins move together, so there are far fewer independent results than the counts suggest; a single year is a handful of market moves.',
    '- Coins are today’s top 100: ones that collapsed and dropped out aren’t included, which flatters bullish calls, more so in the early years.',
    '- Early years have fewer coins (Binance listings), so market averages and rankings there are rougher.',
    '- Past liquidity isn’t available. Market breadth is measured over these coins.',
    '- No trading costs, taxes or slippage. Not financial advice.',
  );
  if (c.pegged.length) L.push(`- Pegged (price barely moves), not rated or tested: ${c.pegged.join(', ')}.`);
  if (c.missing.length) L.push(`- Left out (no Binance history, or too little of it): ${c.missing.join(', ')}.`);
  L.push('');
  return L.join('\n');
}

/** Fills Comparison.groupHits (kept separate so compare() stays one pass over the rules). */
export function addGroupHits(c: Comparison, coins: CoinInput[]): Comparison {
  const { days, market } = prepare(coins);
  const tally: Record<string, { bn: number; bb: number; sn: number; sl: number }> = {};
  for (const [d, list] of days) {
    if (isTuning(yearOf(d * 86_400_000))) continue;
    const mkt = market.get(d)?.forward[30];
    if (mkt == null) continue;
    for (const x of list) {
      const ret = x.r.returns[30];
      if (ret == null) continue;
      for (const g of GROUPS) {
        const t = (tally[g.key] ??= { bn: 0, bb: 0, sn: 0, sl: 0 });
        const dir = dirOf(x.r.signals[g.key]);
        if (dir === 1) (t.bn++, ret > mkt && t.bb++);
        if (dir === -1) (t.sn++, ret < mkt && t.sl++);
      }
    }
  }
  c.groupHits = Object.fromEntries(Object.entries(tally).map(([k, t]) => [k, { bull: pct(t.bb, t.bn), bear: pct(t.sl, t.sn) }]));
  return c;
}
