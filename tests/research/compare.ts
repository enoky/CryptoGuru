import { AGREEMENTS, HORIZONS, type Horizon, type Reading } from '../../shared/backtest';
import { dirOf, GROUPS, type SignalLabel } from '../../shared/signals';
import { v1Label } from './v1';

/**
 * Compares the live rules with the pre-Phase-4 rules and two simple baselines
 * on the same coin-days, separately for the older and newer half of the
 * history. Any tuning may only look at the older half; the newer half is the
 * test.
 */

type Dir = 1 | 0 | -1;

export const RULES = [
  { key: 'current', name: 'Current rules (Phase 4)' },
  { key: 'v1', name: 'Rules before Phase 4' },
  { key: 'momentum', name: '90-day momentum' },
  { key: 'always', name: 'Always bullish' },
] as const;
export type RuleKey = (typeof RULES)[number]['key'];

const labelDir = (l: SignalLabel | null): Dir | null => (l == null ? null : l.includes('bullish') ? 1 : l.includes('bearish') ? -1 : 0);

export function directions(r: Reading): Record<RuleKey, Dir | null> {
  const m = r.metrics.return90d;
  return {
    current: labelDir(r.label),
    v1: labelDir(v1Label(r.metrics)),
    momentum: m == null ? null : (Math.sign(m) as Dir),
    always: 1,
  };
}

export interface RuleStats {
  days: number;
  calls: number;
  right: number;
  bull: { n: number; sum: number; rose: number };
  bear: { n: number; sum: number; fell: number };
}

const emptyStats = (): RuleStats => ({ days: 0, calls: 0, right: 0, bull: { n: 0, sum: 0, rose: 0 }, bear: { n: 0, sum: 0, fell: 0 } });

export type Half = 'older' | 'newer';
export const HALVES: Half[] = ['older', 'newer'];

export interface Comparison {
  coins: string[];
  missing: string[];
  /** Left out because the price barely moves (see hasPeggedPrice). */
  pegged: string[];
  from: number;
  to: number;
  split: number;
  rules: Record<Half, Record<Horizon, Record<RuleKey, RuleStats>>>;
  agreement: Record<Half, Record<Horizon, Record<string, { n: number; right: number }>>>;
  groups: Record<Half, Record<Horizon, Record<string, { bull: { n: number; rose: number }; bear: { n: number; fell: number } }>>>;
}

/** The median reading date: older readings fall before it. */
export function splitDate(all: Reading[][]): number {
  const ts = all.flat().map((r) => r.t).sort((a, b) => a - b);
  return ts.length ? ts[Math.floor(ts.length / 2)] : 0;
}

export function compare(byCoin: { id: string; readings: Reading[] }[], missing: string[] = [], pegged: string[] = []): Comparison {
  const split = splitDate(byCoin.map((c) => c.readings));
  const make = <T>(f: () => T) => ({ older: { 7: f(), 30: f() }, newer: { 7: f(), 30: f() } }) as Record<Half, Record<Horizon, T>>;
  const out: Comparison = {
    coins: byCoin.filter((c) => c.readings.length).map((c) => c.id),
    missing,
    pegged,
    from: Infinity,
    to: -Infinity,
    split,
    rules: make(() => Object.fromEntries(RULES.map((r) => [r.key, emptyStats()])) as Record<RuleKey, RuleStats>),
    agreement: make(() => Object.fromEntries(AGREEMENTS.map((c) => [c, { n: 0, right: 0 }]))),
    groups: make(() => Object.fromEntries(GROUPS.map((g) => [g.key, { bull: { n: 0, rose: 0 }, bear: { n: 0, fell: 0 } }]))),
  };
  for (const { readings } of byCoin) {
    for (const r of readings) {
      out.from = Math.min(out.from, r.t);
      out.to = Math.max(out.to, r.t);
      const half: Half = r.t < split ? 'older' : 'newer';
      const dirs = directions(r);
      for (const h of HORIZONS) {
        const ret = r.returns[h];
        if (ret == null) continue;
        const moved = Math.sign(ret);
        for (const rule of RULES) {
          const st = out.rules[half][h][rule.key];
          st.days++;
          const d = dirs[rule.key];
          if (d === 1) (st.bull.n++, (st.bull.sum += ret), ret > 0 && st.bull.rose++);
          if (d === -1) (st.bear.n++, (st.bear.sum += ret), ret < 0 && st.bear.fell++);
          if (d === 1 || d === -1) (st.calls++, moved === d && st.right++);
        }
        if (r.agreement && (dirs.current === 1 || dirs.current === -1)) {
          const c = out.agreement[half][h][r.agreement];
          c.n++;
          if (moved === dirs.current) c.right++;
        }
        for (const g of GROUPS) {
          const d = dirOf(r.signals[g.key]);
          const t = out.groups[half][h][g.key];
          if (d === 1) (t.bull.n++, ret > 0 && t.bull.rose++);
          if (d === -1) (t.bear.n++, ret < 0 && t.bear.fell++);
        }
      }
    }
  }
  return out;
}

const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '—');
const avg = (sum: number, n: number) => (n ? `${sum / n >= 0 ? '+' : '−'}${Math.abs((sum / n) * 100).toFixed(2)}%` : '—');
const date = (t: number) => new Date(t).toISOString().slice(0, 10);
const num = (n: number) => n.toLocaleString('en-US');

/** Average return after bullish calls minus after bearish calls, in percentage points: above 0 means the calls sorted good days from bad. */
export function spread(st: RuleStats): number | null {
  if (!st.bull.n || !st.bear.n) return null;
  return (st.bull.sum / st.bull.n - st.bear.sum / st.bear.n) * 100;
}

export function toMarkdown(c: Comparison, now = Date.now()): string {
  const L: string[] = [];
  L.push('# Signal backtest: all rated coins', '');
  L.push(
    `Run ${date(now)} · ${c.coins.length} coins · ${date(c.from)} to ${date(c.to)} · older half before ${date(c.split)}, newer half from then on.`,
    '',
  );
  L.push(
    'Every coin-day replays the rules on data up to that day only. **Right** is how often the price then moved the way a bullish or bearish call leaned. **Spread** is the average return after bullish calls minus after bearish calls: above 0 means the calls told better days from worse ones, which the hit rate alone can’t show in a market that mostly rose or fell. The rules were written before this test was first run; any later tuning may only look at the older half, so the newer half stays a fair test.',
    '',
  );
  for (const h of HORIZONS) {
    for (const half of HALVES) {
      L.push(`## Next ${h} days, ${half} half`, '');
      L.push('| Rules | Calls (share of days) | Right | Avg after bullish | Avg after bearish | Spread |', '|---|---|---|---|---|---|');
      for (const rule of RULES) {
        const st = c.rules[half][h][rule.key];
        const sp = spread(st);
        L.push(
          `| ${rule.name} | ${num(st.calls)} (${pct(st.calls, st.days)}) | ${pct(st.right, st.calls)} | ${avg(st.bull.sum, st.bull.n)} | ${avg(st.bear.sum, st.bear.n)} | ${sp == null ? '—' : `${sp >= 0 ? '+' : '−'}${Math.abs(sp).toFixed(2)} pts`} |`,
        );
      }
      L.push('');
    }
  }
  L.push('## Were ratings right more often when the checks agreed? (current rules)', '');
  L.push(`| Agreement | ${HORIZONS.flatMap((h) => HALVES.map((half) => `${h}d ${half}`)).join(' | ')} |`);
  L.push(`|---|${HORIZONS.flatMap(() => HALVES.map(() => '---')).join('|')}|`);
  for (const conf of AGREEMENTS) {
    const cells = HORIZONS.flatMap((h) => HALVES.map((half) => c.agreement[half][h][conf])).map((x) => `${pct(x.right, x.n)} (${num(x.n)})`);
    L.push(`| ${conf} | ${cells.join(' | ')} |`);
  }
  L.push('', 'Right = share of bullish or bearish ratings the price then agreed with (number of coin-days in brackets). If agreement helped, High would beat Low.', '');
  L.push('## Each check (current rules, next 30 days)', '');
  L.push('| Check | When bullish: rose (older / newer) | When bearish: fell (older / newer) |', '|---|---|---|');
  for (const g of GROUPS) {
    const o = c.groups.older[30][g.key];
    const n = c.groups.newer[30][g.key];
    L.push(`| ${g.name} | ${pct(o.bull.rose, o.bull.n)} / ${pct(n.bull.rose, n.bull.n)} | ${pct(o.bear.fell, o.bear.n)} / ${pct(n.bear.fell, n.bear.n)} |`);
  }
  const base = (half: Half) => c.rules[half][30].always;
  L.push(
    '',
    `Yardstick (any day, next 30 days): rose ${pct(base('older').right, base('older').calls)} / ${pct(base('newer').right, base('newer').calls)}; fell ${pct(base('older').calls - base('older').right, base('older').calls)} / ${pct(base('newer').calls - base('newer').right, base('newer').calls)} (flat days count as neither).`,
    '',
  );
  L.push('## Caveats', '');
  L.push(
    '- Neighbouring days overlap (their windows share most days), and the coins move together, so there are far fewer independent results than the counts suggest.',
    '- Coins are today’s top 100: ones that collapsed and dropped out aren’t included, which flatters bullish calls.',
    '- Past liquidity isn’t available. Market breadth is measured over these coins.',
    '- No trading costs, taxes or slippage. Not financial advice.',
  );
  if (c.pegged.length) L.push(`- Pegged (price barely moves), not rated or tested: ${c.pegged.join(', ')}.`);
  if (c.missing.length) L.push(`- Left out (no exchange history, or too little of it): ${c.missing.join(', ')}.`);
  L.push('');
  return L.join('\n');
}
