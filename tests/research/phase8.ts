import { dayKey } from '../../shared/backtest';
import { prepare, TUNING_END_YEAR, type CoinDay, type CoinInput } from './compare';
import { cotByDay, type CotReport } from './cftc';
import { BASE_RULES, dirOfScore, evaluate, LIVE_WEIGHTS, rulesTable, scoreWith, yearly, type Evaluated, type Rule } from './deeper';
import { ACCEPTANCE, verdict } from './phase7';

/**
 * Phase 8 (PLAN.md §5): CME Bitcoin futures positioning from the CFTC, as
 * market timing and as a fifth check, every setting fixed before the run.
 */

export const ASSET_LEVELS = [0, 2, 5] as const;
export const ASSET_FULL = 5;
export const CHECK_WEIGHT = 15;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface Phase8 {
  ev: Evaluated;
  asset: string[];
  picked: string | null;
  reports: number;
  from: number | null;
  source: string;
}

export function phase8(coins: CoinInput[], reports: CotReport[], source: string): Phase8 {
  const { days, market } = prepare(coins);
  const lastDay = Math.max(0, ...[...days.keys()]);
  const cot = cotByDay(reports, lastDay);
  const at = (x: CoinDay) => cot.get(dayKey(x.r.t));

  const assetRules: Rule[] = ASSET_LEVELS.map((L) => ({
    key: `cftc-asset-${L}`,
    name: `Follow asset managers (4-week change beyond ±${L} points)`,
    judged: 'abs',
    dir: (x) => {
      const c = at(x)?.assetChange4;
      return c == null ? null : c > L ? 1 : c < -L ? -1 : 0;
    },
  }));
  const rules: Rule[] = [
    ...BASE_RULES,
    ...assetRules,
    {
      key: 'cftc-lev',
      name: 'Against leveraged funds at extremes (top / bottom fifth of 52 weeks)',
      judged: 'abs',
      dir: (x) => {
        const p = at(x)?.levPercentile;
        return p == null ? null : p >= 80 ? -1 : p <= 20 ? 1 : 0;
      },
    },
    {
      key: 'cftc-check',
      name: `Current rules + asset-manager change as a fifth check (weight ${CHECK_WEIGHT})`,
      judged: 'abs',
      dir: (x) => {
        const c = at(x)?.assetChange4;
        return dirOfScore(scoreWith(x, LIVE_WEIGHTS, { weight: CHECK_WEIGHT, value: c == null ? null : clamp(c / ASSET_FULL, -1, 1) }));
      },
    },
  ];
  const ev = evaluate(days, market, reports.length ? rules : BASE_RULES);
  let picked: string | null = null;
  let top = -Infinity;
  for (const r of assetRules) {
    const m = yearly(ev, r.key, 'tuning', 'abs').mean;
    if (m != null && m > top) (top = m), (picked = r.key);
  }
  return { ev, asset: reports.length ? assetRules.map((r) => r.key) : [], picked, reports: reports.length, from: reports[0]?.t ?? null, source };
}

export function phase8Markdown(p: Phase8): string {
  const L: string[] = ['## CME futures positioning (Phase 8), next 30 days', ''];
  if (!p.reports) {
    L.push(`CFTC positioning couldn’t be downloaded (${p.source}), so this wasn’t tested.`, '');
    return L.join('\n');
  }
  L.push(
    `${p.reports.toLocaleString('en-US')} weekly CFTC Traders in Financial Futures reports for CME Bitcoin futures from ${new Date(p.from!).toISOString().slice(0, 10)} (${p.source}). Each report counts from the Saturday after its Tuesday positions date, when it had been published. Readings are market-wide, so timing rules give every coin the same call on a day. Asset managers: change in net position (% of open interest) over 4 reports. Leveraged funds: net position's place among the previous 52 reports. Settings were picked on the tuning years (up to ${TUNING_END_YEAR}).`,
    '',
  );
  const names = Object.fromEntries(p.asset.map((k) => [k, `${p.ev.rules.find((r) => r.key === k)!.name}${k === p.picked ? ' ← picked' : ''}`]));
  L.push(...rulesTable(p.ev, ['current', 'momentum', ...p.asset, 'cftc-lev', 'cftc-check'], names));
  const v = (key: string) => {
    const r = verdict(p.ev, key);
    return `${r.pass ? '**Passes**' : '**Fails**'}: ${r.why}.`;
  };
  if (p.picked) L.push(`Follow asset managers, picked level: ${v(p.picked)}`, '');
  L.push(`Against leveraged funds: ${v('cftc-lev')}`, '', `Fifth check: ${v('cftc-check')}`, '');
  L.push(
    ACCEPTANCE,
    '',
    'Caveats: since the US spot ETFs launched (January 2024) much of the leveraged-fund short is a basis trade (short futures, long the ETF), not a view on price. Reports delayed by US government shutdowns (early 2019, late 2025) were published weeks late, so on those weeks this backtest uses them a little earlier than anyone could have.',
    '',
  );
  return L.join('\n');
}
