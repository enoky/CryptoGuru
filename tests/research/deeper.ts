import { GROUPS, toneOf, type GroupKey, type SignalLabel } from '../../shared/signals';
import { bootstrap, median } from '../../shared/stats';
import { prepare, TUNING_END_YEAR, type CoinDay, type CoinInput } from './compare';

export { bootstrap };

/**
 * Deeper checks on the current rules (PLAN.md §5, Phase 6), all on 30-day
 * returns:
 * - learned weights: logistic regression fitted on the tuning years only,
 *   then judged on the held-out years like any other candidate;
 * - ablation: the current rules with one check left out at a time;
 * - each rating in detail: median, average gain and loss, worst case;
 * - uncertainty: 90% ranges from resampling whole months (a block
 *   bootstrap), because neighbouring days and coins aren't independent.
 */

type Dir = 1 | 0 | -1;
type Split = 'tuning' | 'heldout';
export const SPLITS: Split[] = ['tuning', 'heldout'];
const CUT = 15;

const yearOf = (d: number) => new Date(d * 86_400_000).getUTCFullYear();
const monthOf = (d: number) => {
  const t = new Date(d * 86_400_000);
  return t.getUTCFullYear() * 12 + t.getUTCMonth();
};
const splitOf = (d: number): Split => (yearOf(d) <= TUNING_END_YEAR ? 'tuning' : 'heldout');

/** A group's reading, with "no data" as null. */
const reading = (x: CoinDay, k: GroupKey) => x.r.signals[k] ?? null;

/**
 * The current scoring with any weights: Σ wᵢ·readingᵢ over the groups with data,
 * divided by Σ|wᵢ| over the same groups, × 100. With the live weights this is the
 * live score. Like the live rules: no rating without a trend reading (unless
 * the trend weight is 0) or with fewer than two checks.
 */
export function scoreWith(x: CoinDay, w: Record<GroupKey, number>): number | null {
  if (w.trend !== 0 && reading(x, 'trend') == null) return null;
  let num = 0;
  let den = 0;
  let used = 0;
  for (const g of GROUPS) {
    const v = reading(x, g.key);
    if (v == null) continue;
    // Like the live rules: eligibility counts checks with data, whatever their weight, so every variant rates the same coin-days.
    used++;
    num += w[g.key] * v;
    den += Math.abs(w[g.key]);
  }
  if (used < 2) return null;
  return den ? Math.round((num / den) * 100) || 0 : 0;
}

const dirOfScore = (s: number | null): Dir | null => (s == null ? null : s >= CUT ? 1 : s <= -CUT ? -1 : 0);

export const LIVE_WEIGHTS = Object.fromEntries(GROUPS.map((g) => [g.key, g.weight])) as Record<GroupKey, number>;

/**
 * Logistic regression by Newton's method with a small ridge penalty:
 * P(y = 1) = σ(b₀ + Σ bᵢ·xᵢ). Returns [b₀, b₁ … bₙ].
 */
export function fitLogistic(X: number[][], y: number[], ridge = 1e-3, iterations = 25): number[] {
  const p = X[0].length + 1;
  const b = new Array(p).fill(0);
  for (let it = 0; it < iterations; it++) {
    const g = new Array(p).fill(0);
    const H = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let i = 0; i < X.length; i++) {
      const row = [1, ...X[i]];
      const z = row.reduce((a, v, j) => a + v * b[j], 0);
      const mu = 1 / (1 + Math.exp(-z));
      const wgt = mu * (1 - mu);
      for (let j = 0; j < p; j++) {
        g[j] += (y[i] - mu) * row[j];
        for (let k = 0; k < p; k++) H[j][k] += wgt * row[j] * row[k];
      }
    }
    for (let j = 1; j < p; j++) {
      g[j] -= ridge * X.length * b[j];
      H[j][j] += ridge * X.length;
    }
    const step = solve(H, g);
    for (let j = 0; j < p; j++) b[j] += step[j];
    if (Math.max(...step.map(Math.abs)) < 1e-9) break;
  }
  return b;
}

/** Solves A·x = v by Gaussian elimination with partial pivoting. */
function solve(A: number[][], v: number[]): number[] {
  const n = v.length;
  const M = A.map((row, i) => [...row, v[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]));
}

interface Rule {
  key: string;
  name: string;
  /** 'abs': judged on up/down spread; 'rel': on spread against the market. */
  judged: 'abs' | 'rel';
  dir: (x: CoinDay) => Dir | null;
}

/** Bullish/bearish sums for one rule in one month. */
interface Sums {
  bn: number;
  bs: number;
  br: number;
  sn: number;
  ss: number;
  sr: number;
}
const emptySums = (): Sums => ({ bn: 0, bs: 0, br: 0, sn: 0, ss: 0, sr: 0 });
const addSums = (a: Sums, b: Sums) => {
  a.bn += b.bn;
  a.bs += b.bs;
  a.br += b.br;
  a.sn += b.sn;
  a.ss += b.ss;
  a.sr += b.sr;
};
export const absSpread = (s: Sums) => (s.bn && s.sn ? (s.bs / s.bn - s.ss / s.sn) * 100 : null);
export const relSpreadOf = (s: Sums) => (s.bn && s.sn ? (s.br / s.bn - s.sr / s.sn) * 100 : null);

export interface Deeper {
  /** Live weights and the two fitted sets, as signed shares of Σ|w| (%). */
  weights: Record<'live' | 'learnedAbs' | 'learnedRel', Record<GroupKey, number>>;
  rules: { key: string; name: string; judged: 'abs' | 'rel' }[];
  /** rule → split → year → sums; rule → split → month → sums. */
  byYear: Record<string, Record<Split, Map<number, Sums>>>;
  byMonth: Record<string, Record<Split, Map<number, Sums>>>;
  /** Current ratings' 30-day returns (and every coin-day's, as 'Any'), per split, with per-month sums for ranges. */
  labels: Record<Split, Record<string, { all: number[]; months: Map<number, { n: number; sum: number }> }>>;
}

const signedShares = (w: Record<GroupKey, number>) => {
  const total = GROUPS.reduce((a, g) => a + Math.abs(w[g.key]), 0) || 1;
  return Object.fromEntries(GROUPS.map((g) => [g.key, (w[g.key] / total) * 100])) as Record<GroupKey, number>;
};

export function deeper(coins: CoinInput[]): Deeper {
  const { days, market } = prepare(coins);

  // Fit on the tuning years only: one row per coin-day with a 30-day result.
  const fit = (target: 'abs' | 'rel') => {
    const X: number[][] = [];
    const y: number[] = [];
    for (const [d, list] of days) {
      if (splitOf(d) !== 'tuning') continue;
      const mkt = market.get(d)?.forward[30];
      for (const x of list) {
        const ret = x.r.returns[30];
        if (ret == null || mkt == null || reading(x, 'trend') == null) continue;
        X.push(GROUPS.map((g) => reading(x, g.key) ?? 0));
        y.push((target === 'abs' ? ret : ret - mkt) > 0 ? 1 : 0);
      }
    }
    if (X.length < 100) return null;
    const b = fitLogistic(X, y);
    return Object.fromEntries(GROUPS.map((g, i) => [g.key, b[i + 1]])) as Record<GroupKey, number>;
  };
  const zero = Object.fromEntries(GROUPS.map((g) => [g.key, 0])) as Record<GroupKey, number>;
  const learnedAbs = fit('abs') ?? zero;
  const learnedRel = fit('rel') ?? zero;

  const labelDir = (l: SignalLabel | null): Dir | null => (l == null ? null : ({ up: 1, down: -1, neutral: 0 } as const)[toneOf(l)]);
  const rules: Rule[] = [
    { key: 'current', name: 'Current rules', judged: 'abs', dir: (x) => labelDir(x.r.label) },
    { key: 'momentum', name: '90-day momentum', judged: 'abs', dir: (x) => (x.r.metrics.return90d == null ? null : (Math.sign(x.r.metrics.return90d) as Dir)) },
    { key: 'learnedAbs', name: 'Learned weights (up or down)', judged: 'abs', dir: (x) => dirOfScore(scoreWith(x, learnedAbs)) },
    { key: 'learnedRel', name: 'Learned weights (against the market)', judged: 'rel', dir: (x) => dirOfScore(scoreWith(x, learnedRel)) },
    ...GROUPS.map(
      (g): Rule => ({
        key: `without-${g.key}`,
        name: `Current rules without ${g.name}`,
        judged: 'abs',
        dir: (x) => dirOfScore(scoreWith(x, { ...LIVE_WEIGHTS, [g.key]: 0 })),
      }),
    ),
  ];

  const out: Deeper = {
    weights: { live: signedShares(LIVE_WEIGHTS), learnedAbs: signedShares(learnedAbs), learnedRel: signedShares(learnedRel) },
    rules: rules.map(({ key, name, judged }) => ({ key, name, judged })),
    byYear: {},
    byMonth: {},
    labels: { tuning: {}, heldout: {} },
  };
  const slot = (store: Deeper['byYear'], rule: string, split: Split, k: number) => {
    const bySplit = (store[rule] ??= { tuning: new Map(), heldout: new Map() });
    let s = bySplit[split].get(k);
    if (!s) bySplit[split].set(k, (s = emptySums()));
    return s;
  };
  const label = (split: Split, name: string, month: number, ret: number) => {
    const l = (out.labels[split][name] ??= { all: [], months: new Map() });
    l.all.push(ret);
    const m = l.months.get(month) ?? { n: 0, sum: 0 };
    m.n++;
    m.sum += ret;
    l.months.set(month, m);
  };

  for (const [d, list] of days) {
    const mkt = market.get(d)?.forward[30];
    if (mkt == null) continue;
    const split = splitOf(d);
    const year = yearOf(d);
    const month = monthOf(d);
    for (const x of list) {
      const ret = x.r.returns[30];
      if (ret == null) continue;
      const rel = ret - mkt;
      label(split, 'Any', month, ret);
      if (x.r.label) label(split, x.r.label, month, ret);
      for (const rule of rules) {
        const dir = rule.dir(x);
        if (dir !== 1 && dir !== -1) continue;
        for (const s of [slot(out.byYear, rule.key, split, year), slot(out.byMonth, rule.key, split, month)]) {
          if (dir === 1) (s.bn++, (s.bs += ret), (s.br += rel));
          else (s.sn++, (s.ss += ret), (s.sr += rel));
        }
      }
    }
  }
  return out;
}

const pts = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`);
const pctv = (v: number | null, digits = 1) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}%`);
const range = (r: [number, number] | null, f: (v: number) => string) => (r ? `${f(r[0])} to ${f(r[1])}` : '—');

function metricOf(judged: 'abs' | 'rel') {
  return judged === 'abs' ? absSpread : relSpreadOf;
}

/** Average of the yearly values in a split; and how many years were positive. */
export function yearly(d: Deeper, rule: string, split: Split, judged: 'abs' | 'rel'): { mean: number | null; positive: number; of: number } {
  const vals = [...(d.byYear[rule]?.[split].values() ?? [])].map(metricOf(judged)).filter((v): v is number => v != null);
  return { mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, positive: vals.filter((v) => v > 0).length, of: vals.length };
}

/** Pooled spread over a split, with a 90% month-block range; and the difference from the current rules, with its range. */
export function pooled(d: Deeper, rule: string, split: Split, judged: 'abs' | 'rel') {
  const metric = metricOf(judged);
  const months = [...new Set([...(d.byMonth[rule]?.[split].keys() ?? []), ...(d.byMonth.current?.[split].keys() ?? [])])];
  const sumOf = (r: string, ms: number[]) => {
    const s = emptySums();
    for (const m of ms) {
      const x = d.byMonth[r]?.[split].get(m);
      if (x) addSums(s, x);
    }
    return s;
  };
  const value = metric(sumOf(rule, months));
  const ci = bootstrap(months, (ms) => metric(sumOf(rule, ms)));
  const diff =
    rule === 'current'
      ? null
      : bootstrap(months, (ms) => {
          const a = metric(sumOf(rule, ms));
          const b = metric(sumOf('current', ms));
          return a == null || b == null ? null : a - b;
        });
  return { value, ci, diff };
}

export function deeperMarkdown(d: Deeper): string {
  const L: string[] = [];
  const w = (x: number) => `${x >= 0 ? '' : '−'}${Math.abs(x).toFixed(0)}%`;
  L.push('## Learned weights (Phase 6)', '');
  L.push(
    `Logistic regression fitted on the tuning years only (up to ${TUNING_END_YEAR}), on the same four readings, to predict whether a coin rose over the next 30 days (or beat the average coin). The weights are shown as signed shares; a negative weight means that reading pointed the wrong way in the tuning years. The learned rules then score coins exactly like the live ones (±15 bands) and are judged on the held-out years.`,
    '',
  );
  L.push(`| Check | Live weights | Learned (up or down) | Learned (against the market) |`, '|---|---|---|---|');
  for (const g of GROUPS) L.push(`| ${g.name} | ${w(d.weights.live[g.key])} | ${w(d.weights.learnedAbs[g.key])} | ${w(d.weights.learnedRel[g.key])} |`);
  L.push('');

  const table = (keys: string[]) => {
    L.push(
      '| Rules | Judged on | Spread, tuning (avg of years) | Spread, held-out (avg of years) | Held-out years positive | Held-out pooled [90% range] | Difference from current rules, held-out [90% range] |',
      '|---|---|---|---|---|---|---|',
    );
    for (const key of keys) {
      const r = d.rules.find((x) => x.key === key);
      if (!r) continue;
      const t = yearly(d, key, 'tuning', r.judged);
      const h = yearly(d, key, 'heldout', r.judged);
      const p = pooled(d, key, 'heldout', r.judged);
      L.push(
        `| ${r.name} | ${r.judged === 'abs' ? 'up or down' : 'against the market'} | ${pts(t.mean)} | ${pts(h.mean)} | ${h.of ? `${h.positive} of ${h.of}` : '—'} | ${pts(p.value)} [${range(p.ci, pts)}] | ${key === 'current' ? '—' : range(p.diff, pts)} |`,
      );
    }
    L.push('');
  };
  table(['current', 'momentum', 'learnedAbs', 'learnedRel']);
  L.push(
    'A difference range that includes 0 means the result could be chance. The ranges come from resampling whole months 1,000 times, so days that overlap and coins that move together count once, not many times.',
    '',
  );

  L.push('## Which checks matter? (ablation, next 30 days)', '');
  L.push('The current rules with one check left out (its weight set to 0, the others rescaled). If leaving a check out makes the spread better, that check was hurting.', '');
  table(['current', ...GROUPS.map((g) => `without-${g.key}`)]);

  const order = ['Strong uptrend', 'Uptrend', 'No clear trend', 'Downtrend', 'Strong downtrend', 'Any'];
  for (const split of SPLITS) {
    L.push(`## Ratings in detail, ${split === 'tuning' ? 'tuning' : 'held-out'} years (next 30 days)`, '');
    L.push('| Rating | Coin-days | Higher after 30 days | Average [90% range] | Median | Average when it rose | Average when it fell | Worst |', '|---|---|---|---|---|---|---|---|');
    for (const name of order) {
      const l = d.labels[split][name];
      if (!l?.all.length) continue;
      const n = l.all.length;
      const ups = l.all.filter((r) => r > 0);
      const downs = l.all.filter((r) => r < 0);
      const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length) * 100 : null);
      const months = [...l.months.values()];
      const ci = bootstrap(months, (ms) => {
        const tot = ms.reduce((a, m) => a + m.n, 0);
        return tot ? (ms.reduce((a, m) => a + m.sum, 0) / tot) * 100 : null;
      });
      const med = median(l.all);
      L.push(
        `| ${name === 'Any' ? '**Any coin-day (yardstick)**' : name} | ${n.toLocaleString('en-US')} | ${((ups.length / n) * 100).toFixed(1)}% | ${pctv(avg(l.all))} [${range(ci, (v) => pctv(v))}] | ${pctv(med == null ? null : med * 100)} | ${pctv(avg(ups))} | ${pctv(avg(downs))} | ${pctv(Math.min(...l.all) * 100, 0)} |`,
      );
    }
    L.push('');
  }
  L.push('Compare each rating with the yardstick row: a rating only tells you something if it differs from any coin-day by more than its range.', '');
  return L.join('\n');
}
