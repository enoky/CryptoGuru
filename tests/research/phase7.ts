import { dayKey } from '../../shared/backtest';
import type { FetchFn } from '../../shared/http';
import type { Candle } from '../../shared/types';
import { prepare, TUNING_END_YEAR, type CoinDay, type CoinInput } from './compare';
import { BASE_RULES, dirOfScore, evaluate, LIVE_WEIGHTS, pooled, rulesTable, scoreWith, yearly, type Dir, type Evaluated, type Rule } from './deeper';

/**
 * Phase 7, Steps 2 and 3 (PLAN.md §5): one volume test and stablecoin supply,
 * with every variant fixed before the run. The variant with the best spread
 * on the tuning years is picked; it passes only if, on the held-out years, it
 * beats the current rules and 90-day momentum, is positive in most years, and
 * the 90% range of its difference from the current rules excludes 0.
 */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const sign = (v: number) => Math.sign(v) as Dir;

/** For each day, the 7-day average volume's percentile (0–100) among the previous 180 days' 7-day averages. */
export function volumePercentiles(candles: Candle[]): Map<number, number> {
  const out = new Map<number, number>();
  const avg7: number[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].v;
    if (i >= 7) sum -= candles[i - 7].v;
    avg7.push(i >= 6 ? sum / 7 : NaN);
    if (i < 6 + 180) continue;
    let below = 0;
    for (let j = i - 180; j < i; j++) if (avg7[j] < avg7[i]) below++;
    out.set(dayKey(candles[i].t), (below / 180) * 100);
  }
  return out;
}

export type VolumeVariant = 'current' | 'graded' | 'surprise80' | 'surprise90' | 'accdist';
export const VOLUME_VARIANTS: { key: VolumeVariant; name: string }[] = [
  { key: 'current', name: 'Volume as now (7d ÷ 30d above 1.3 → direction of the 7-day move)' },
  { key: 'graded', name: 'Graded volume ((ratio − 1) ÷ 0.6, capped)' },
  { key: 'surprise80', name: 'Volume surprise (80th percentile of 180 days)' },
  { key: 'surprise90', name: 'Volume surprise (90th percentile of 180 days)' },
  { key: 'accdist', name: 'Accumulation / distribution' },
];

/** The volume reading under a variant, from the coin-day's metrics (and its volume percentile). */
export function volumeReading(x: CoinDay, variant: VolumeVariant, pct: number | null): number | null {
  const { volumeRatio: ratio, return7d: r7 } = x.r.metrics;
  if (ratio == null || r7 == null) return null;
  switch (variant) {
    case 'current':
      return ratio > 1.3 ? sign(r7) : 0;
    case 'graded':
      return sign(r7) * clamp((ratio - 1) / 0.6, 0, 1);
    case 'surprise80':
    case 'surprise90':
      if (pct == null) return null;
      return pct >= (variant === 'surprise80' ? 80 : 90) ? sign(r7) : 0;
    case 'accdist':
      if (ratio > 1.3 && Math.abs(r7) < 3) return 1;
      if (ratio < 0.8 && r7 > 5) return -1;
      return ratio > 1.3 ? sign(r7) : 0;
  }
}

/** Total stablecoin supply (USD) by day from DefiLlama's keyless stablecoin API. */
export const STABLECOINS_URL = 'https://stablecoins.llama.fi/stablecoincharts/all';

export function parseStablecoins(rows: unknown): Map<number, number> {
  if (!Array.isArray(rows)) throw new Error('stablecoins: expected an array');
  const out = new Map<number, number>();
  for (const r of rows as { date?: unknown; totalCirculatingUSD?: Record<string, unknown> }[]) {
    const t = Number(r?.date) * 1000;
    const usd = r?.totalCirculatingUSD;
    if (!Number.isFinite(t) || t <= 0 || !usd || typeof usd !== 'object') continue;
    const total = Object.values(usd).reduce<number>((a, v) => a + (typeof v === 'number' && Number.isFinite(v) ? v : 0), 0);
    if (total > 0) out.set(dayKey(t), total);
  }
  return out;
}

export async function stablecoinSupply(fetchFn: FetchFn): Promise<Map<number, number>> {
  const res = await fetchFn(STABLECOINS_URL);
  if (!res.ok) throw new Error(`stablecoins: HTTP ${res.status}`);
  return parseStablecoins(await res.json());
}

/** Change in total supply over the 30 days to day `d`, %; null without both values. */
export function supplyChange30(supply: Map<number, number>, d: number): number | null {
  const now = supply.get(d);
  const then = supply.get(d - 30);
  return now && then ? (now / then - 1) * 100 : null;
}

export const TIMING_LEVELS = [0, 1, 2] as const;
export const SUPPLY_WEIGHT = 15;
export const SUPPLY_FULL = 3;

export interface Phase7 {
  ev: Evaluated;
  volume: { keys: string[]; picked: string };
  supply: { timing: string[]; picked: string | null; check: string | null; days: number };
}

export function phase7(coins: CoinInput[], supply: Map<number, number> | null): Phase7 {
  const { days, market } = prepare(coins);
  const pctByCoin = new Map(coins.map((c) => [c.id, volumePercentiles(c.candles)]));
  const pctOf = (x: CoinDay) => pctByCoin.get(x.id)?.get(dayKey(x.r.t)) ?? null;

  const withVolume = (x: CoinDay, v: number | null): CoinDay => ({ ...x, r: { ...x.r, signals: { ...x.r.signals, volume: v } } });
  const volumeRules: Rule[] = VOLUME_VARIANTS.map((v) => ({
    key: `volume-${v.key}`,
    name: v.name,
    judged: 'abs',
    dir: (x) => dirOfScore(scoreWith(withVolume(x, volumeReading(x, v.key, pctOf(x))), LIVE_WEIGHTS)),
  }));

  const change = (x: CoinDay) => (supply ? supplyChange30(supply, dayKey(x.r.t)) : null);
  const timingRules: Rule[] = supply
    ? TIMING_LEVELS.map((L) => ({
        key: `supply-timing-${L}`,
        name: `Stablecoin supply as market timing (±${L}% over 30 days)`,
        judged: 'abs',
        dir: (x) => {
          const c = change(x);
          return c == null ? null : c > L ? 1 : c < -L ? -1 : 0;
        },
      }))
    : [];
  const checkRule: Rule[] = supply
    ? [
        {
          key: 'supply-check',
          name: `Current rules + stablecoin supply as a fifth check (weight ${SUPPLY_WEIGHT})`,
          judged: 'abs',
          dir: (x) => {
            const c = change(x);
            return dirOfScore(scoreWith(x, LIVE_WEIGHTS, { weight: SUPPLY_WEIGHT, value: c == null ? null : clamp(c / SUPPLY_FULL, -1, 1) }));
          },
        },
      ]
    : [];

  const ev = evaluate(days, market, [...BASE_RULES, ...volumeRules, ...timingRules, ...checkRule]);
  const best = (keys: string[]) => {
    let pick: string | null = null;
    let top = -Infinity;
    for (const k of keys) {
      const m = yearly(ev, k, 'tuning', 'abs').mean;
      if (m != null && m > top) (top = m), (pick = k);
    }
    return pick;
  };
  const volumeKeys = volumeRules.map((r) => r.key);
  const timingKeys = timingRules.map((r) => r.key);
  return {
    ev,
    volume: { keys: volumeKeys, picked: best(volumeKeys) ?? volumeKeys[0] },
    supply: { timing: timingKeys, picked: best(timingKeys), check: checkRule.length ? 'supply-check' : null, days: supply?.size ?? 0 },
  };
}

/** Points of held-out spread a change must add over the current rules to earn its complexity (PLAN.md §5, standing acceptance rule). */
export const MIN_GAIN = 1;

/** The standing acceptance rule (PLAN.md §5, *Where the accuracy work stops*), with the reason when a rule fails. */
export function verdict(ev: Evaluated, key: string): { pass: boolean; why: string } {
  const h = yearly(ev, key, 'heldout', 'abs');
  const cur = yearly(ev, 'current', 'heldout', 'abs').mean;
  const mom = yearly(ev, 'momentum', 'heldout', 'abs').mean;
  const diff = pooled(ev, key, 'heldout', 'abs').diff;
  const fails: string[] = [];
  if (h.mean == null) return { pass: false, why: 'no held-out spread' };
  if (cur != null && h.mean <= cur) fails.push('not above the current rules');
  else if (cur != null && h.mean - cur < MIN_GAIN) fails.push(`less than ${MIN_GAIN} point above the current rules`);
  if (mom != null && h.mean <= mom) fails.push('not above 90-day momentum');
  if (h.positive * 2 <= h.of) fails.push(`positive in only ${h.positive} of ${h.of} held-out years`);
  if (!diff || diff[0] <= 0) fails.push('the range of its difference from the current rules includes 0');
  return { pass: fails.length === 0, why: fails.length ? fails.join('; ') : 'passes every part' };
}

export const ACCEPTANCE = `Acceptance: on the held-out years, a spread at least ${MIN_GAIN} point above the current rules and above 90-day momentum, positive in most years, and a 90% range for the difference from the current rules that excludes 0.`;

export function phase7Markdown(p: Phase7): string {
  const L: string[] = [];
  const v = (key: string) => {
    const r = verdict(p.ev, key);
    return `${r.pass ? '**Passes**' : '**Fails**'}: ${r.why}.`;
  };
  const mark = (keys: string[], picked: string | null) => Object.fromEntries(keys.map((k) => [k, `${p.ev.rules.find((r) => r.key === k)!.name}${k === picked ? ' ← picked' : ''}`]));

  L.push('## Volume variants (Phase 7, Step 2), next 30 days', '');
  L.push(
    `Each variant replaces only the volume reading in the current rules; everything else is unchanged. The variant with the best spread on the tuning years (up to ${TUNING_END_YEAR}) is picked before looking at the held-out years.`,
    '',
  );
  L.push(...rulesTable(p.ev, ['current', 'momentum', ...p.volume.keys], mark(p.volume.keys, p.volume.picked)));
  L.push(`Picked variant: ${v(p.volume.picked)}`, '');

  L.push('## Stablecoin supply (Phase 7, Step 3), next 30 days', '');
  if (!p.supply.timing.length) {
    L.push('Stablecoin supply history couldn’t be downloaded, so this wasn’t tested.', '');
  } else {
    L.push(
      `Total stablecoin supply from DefiLlama (${p.supply.days.toLocaleString('en-US')} days). Market timing gives every coin the same call on a day, so its spread is the next-30-day return on days supply grew minus days it shrank. The fifth check adds the 30-day change ÷ ${SUPPLY_FULL}% (capped at ±1) to the current rules at weight ${SUPPLY_WEIGHT}.`,
      '',
    );
    const keys = [...p.supply.timing, ...(p.supply.check ? [p.supply.check] : [])];
    L.push(...rulesTable(p.ev, ['current', 'momentum', ...keys], mark(p.supply.timing, p.supply.picked)));
    if (p.supply.picked) L.push(`Market timing, picked level: ${v(p.supply.picked)}`, '');
    if (p.supply.check) L.push(`Fifth check: ${v(p.supply.check)}`, '');
  }
  L.push(
    ACCEPTANCE,
    '',
  );
  return L.join('\n');
}
