<script lang="ts">
  import { avgReturn, CONFIDENCES, HORIZONS, LABELS, pctFell, pctRight, pctRose, type Horizon, type Tally } from '../../shared/backtest';
  import { GROUPS } from '../../shared/signals';
  import HitBar from '../components/HitBar.svelte';
  import ErrorInline from '../components/ErrorInline.svelte';
  import { formatDate, formatPct, sourceLabel } from '../lib/format';
  import { backtest, BACKTEST_COINS, runBacktest } from '../lib/backtest.svelte';
  import { market } from '../lib/market.svelte';
  import { back } from '../lib/router.svelte';
  import { lsGet, lsSet } from '../lib/storage';
  import Icon from '../components/Icon.svelte';

  let horizon = $state<Horizon>(lsGet<Horizon>('backtest:horizon', 30) === 7 ? 7 : 30);

  // Start once market data is available (the coin list comes from it).
  $effect(() => {
    if (market.snapshot?.markets && backtest.status === 'idle') void runBacktest();
  });

  const r = $derived(backtest.result?.horizons[horizon] ?? null);
  const baseRose = $derived(r ? pctRose(r.baseline)! : 0);
  const baseFell = $derived(r ? pctFell(r.baseline)! : 0);
  const pct0 = (n: number | null) => (n == null ? '—' : `${n.toFixed(0)}%`);
  const count = (n: number) => n.toLocaleString('en-US');
  /** Percentage points above or below the baseline, in words. */
  const vsBase = (pct: number | null, base: number) => {
    if (pct == null) return '';
    const d = pct - base;
    if (Math.abs(d) < 2) return 'about the same as any day';
    return `${Math.abs(d).toFixed(0)} points ${d > 0 ? 'more' : 'less'} often than any day`;
  };
  const toneOf = (label: string) => (label.includes('bullish') ? 'bullish' : label.includes('bearish') ? 'bearish' : 'neutral');
  const avg = (t: Tally) => {
    const a = avgReturn(t);
    return a == null ? '—' : formatPct(a, 1);
  };

  function chooseHorizon(h: Horizon) {
    horizon = h;
    lsSet('backtest:horizon', h);
  }
</script>

<div class="flex items-center gap-2">
  <button type="button" class="-ml-2 grid size-11 shrink-0 place-items-center rounded-full hover:bg-surface-2" onclick={() => back('#/signals')} aria-label="Back">
    <Icon name="back" />
  </button>
  <h1 class="text-xl font-bold">How reliable are the signals?</h1>
</div>
<p class="mt-2 text-[15px] text-muted">
  We replayed the same rules on about 2½ years of daily prices for the {BACKTEST_COINS} largest coins and checked what the price did
  next. Each day only uses prices up to that day.
</p>

<div class="mt-3 flex gap-2" role="group" aria-label="Look ahead">
  {#each HORIZONS as h}
    <button
      type="button"
      aria-pressed={horizon === h}
      class="min-h-11 rounded-full border px-4 text-sm font-medium {horizon === h ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface'}"
      onclick={() => chooseHorizon(h)}>Next {h} days</button>
  {/each}
</div>

{#if backtest.status === 'error' && !backtest.result}
  <div class="mt-4"><ErrorInline message={`The backtest couldn’t run: ${backtest.error}`} onretry={() => runBacktest(true)} /></div>
{:else if !r || !backtest.result}
  <div class="mt-4 rounded-2xl border border-line bg-surface p-4" role="status" aria-live="polite">
    <p class="font-medium">
      {backtest.status === 'computing' ? 'Replaying the signals…' : 'Downloading price history…'}
    </p>
    <div class="mt-2 h-2 rounded-full bg-surface-2" aria-hidden="true">
      <div class="h-2 rounded-full bg-accent transition-all" style="width:{backtest.total ? (backtest.done / backtest.total) * 100 : 5}%"></div>
    </div>
    <p class="mt-1 text-sm text-muted">{backtest.done} of {backtest.total || BACKTEST_COINS} coins</p>
  </div>
{:else}
  {@const res = backtest.result}
  <section class="mt-4 rounded-2xl border border-line bg-surface p-4" aria-labelledby="baseline-heading">
    <h2 id="baseline-heading" class="text-sm font-medium text-muted">The yardstick: any day</h2>
    <p class="mt-1 text-[15px]">
      On any day, the price was <strong>higher {horizon} days later {pct0(baseRose)}</strong> of the time (average change {avg(r.baseline)}).
    </p>
    <p class="mt-2 text-sm text-muted">
      A signal is only useful if it beats this. In a mostly rising market almost every bullish signal looks “right”.
    </p>
  </section>

  <section class="mt-5" aria-labelledby="ratings-heading">
    <h2 id="ratings-heading" class="mb-2 px-1 font-semibold">Overall ratings</h2>
    <ul class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {#each LABELS as label}
        {@const t = r.labels[label]}
        {@const tone = toneOf(label)}
        {@const pct = tone === 'bearish' ? pctFell(t) : pctRose(t)}
        <li class="px-4 py-3">
          <div class="flex items-baseline justify-between gap-2">
            <span class="font-medium {tone === 'bullish' ? 'text-up' : tone === 'bearish' ? 'text-down' : ''}">{label}</span>
            <span class="text-sm text-muted tabular-nums">{count(t.n)} days</span>
          </div>
          {#if t.n}
            <p class="text-[15px]">
              {tone === 'bearish' ? 'Lower' : 'Higher'} {horizon} days later <strong>{pct0(pct)}</strong> of the time · average change {avg(t)}
            </p>
            <HitBar pct={pct ?? 0} baseline={tone === 'bearish' ? baseFell : baseRose} {tone} />
            <p class="mt-1 text-xs text-muted">{vsBase(pct, tone === 'bearish' ? baseFell : baseRose)}</p>
          {:else}
            <p class="text-sm text-muted">Didn’t occur in this period.</p>
          {/if}
        </li>
      {/each}
    </ul>
  </section>

  <section class="mt-5" aria-labelledby="ind-heading">
    <h2 id="ind-heading" class="mb-2 px-1 font-semibold">Each check</h2>
    <ul class="space-y-2">
      {#each GROUPS as g}
        {@const t = r.groups[g.key]}
        <li class="rounded-2xl border border-line bg-surface p-4">
          <h3 class="font-medium">{g.name}</h3>
          {#each [{ kind: 'bullish', tally: t.bullish }, { kind: 'bearish', tally: t.bearish }] as row}
            {@const pct = row.kind === 'bearish' ? pctFell(row.tally) : pctRose(row.tally)}
            {@const base = row.kind === 'bearish' ? baseFell : baseRose}
            <div class="mt-2">
              <p class="text-[15px]">
                <span class={row.kind === 'bullish' ? 'text-up' : 'text-down'}>
                  <span aria-hidden="true">{row.kind === 'bullish' ? '▲' : '▼'}</span> When {row.kind}:
                </span>
                {#if row.tally.n}
                  {row.kind === 'bearish' ? 'lower' : 'higher'} {pct0(pct)} of the time
                  <span class="text-sm text-muted">· {count(row.tally.n)} days · average change {avg(row.tally)}</span>
                {:else}
                  <span class="text-muted">didn’t occur</span>
                {/if}
              </p>
              {#if row.tally.n}<HitBar pct={pct ?? 0} baseline={base} tone={row.kind as 'bullish' | 'bearish'} />{/if}
            </div>
          {/each}
        </li>
      {/each}
    </ul>
  </section>

  <section class="mt-5" aria-labelledby="conf-heading">
    <h2 id="conf-heading" class="mb-2 px-1 font-semibold">Does confidence mean anything?</h2>
    <div class="rounded-2xl border border-line bg-surface p-4">
      <p class="text-[15px] text-muted">
        How often bullish and bearish ratings were right (the price went the way they leaned), by confidence. High should beat Low.
      </p>
      <ul class="mt-2 space-y-1.5">
        {#each CONFIDENCES as c}
          {@const h = r.calls[c]}
          <li class="flex items-baseline justify-between gap-3 text-[15px]">
            <span class="font-medium">{c} confidence</span>
            <span class="tabular-nums">
              {#if h.n}<strong>{pct0(pctRight(h))}</strong> right <span class="text-sm text-muted">· {count(h.n)} days</span>{:else}<span class="text-muted">didn’t occur</span>{/if}
            </span>
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <section class="mt-5 rounded-2xl border border-line bg-surface p-4 text-[15px]" aria-labelledby="caveats-heading">
    <h2 id="caveats-heading" class="font-semibold">Read this before trusting any number above</h2>
    <ul class="mt-2 list-disc space-y-1 pl-5 text-muted">
      <li>The past doesn’t predict the future. Rules that worked in one market can fail in the next.</li>
      <li>Neighbouring days overlap (their next-{horizon}-day windows share most days), so there are far fewer truly independent results than the day counts suggest.</li>
      <li>The {BACKTEST_COINS} coins move together, which shrinks the evidence further.</li>
      <li>The coins are today’s largest: ones that collapsed and left the top 100 aren’t included, which flatters the results.</li>
      <li>Market breadth here covers these {BACKTEST_COINS} coins only (the live ratings use about 90), and past liquidity isn’t available, so it never lowers confidence here.</li>
      <li>No trading costs, taxes or slippage are included. This is not financial advice.</li>
    </ul>
    <p class="mt-3 text-sm text-muted">
      {res.coins.length} coins · {formatDate(res.from)} to {formatDate(res.to)} · prices from {backtest.sources.map(sourceLabel).join(', ')} ·
      Fear &amp; Greed from Alternative.me.
      {#if backtest.missing.length}Left out (no history available): {backtest.missing.join(', ')}.{/if}
    </p>
    <button type="button" class="mt-2 min-h-11 rounded-xl px-1 text-sm font-medium text-accent underline" onclick={() => runBacktest(true)}>
      Run again with the latest data
    </button>
  </section>
{/if}
