<script lang="ts">
  import { avgReturn, AGREEMENTS, HORIZONS, LABELS, pctFell, pctRight, pctRose, type Detail, type Horizon, type Tally } from '../../shared/backtest';
  import { GROUPS, toneOf } from '../../shared/signals';
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
  const avg = (t: Tally) => {
    const a = avgReturn(t);
    return a == null ? '—' : formatPct(a, 1);
  };

  const anyDetail = $derived(r?.details?.Any ?? null);
  /** Whether a rating's average stood clear of any day's: only when the two 90% ranges don't overlap. */
  const standing = (d: Detail | undefined) => {
    if (!d?.range || !anyDetail?.range) return null;
    if (d.range[0] > anyDetail.range[1]) return 'Its average was clearly above any day’s.';
    if (d.range[1] < anyDetail.range[0]) return 'Its average was clearly below any day’s.';
    return 'Its average was within chance of any day’s.';
  };

  function chooseHorizon(h: Horizon) {
    horizon = h;
    lsSet('backtest:horizon', h);
  }
</script>

{#snippet detail(d: Detail | undefined)}
  {#if d}
    <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm tabular-nums">
      <dt class="text-muted">Typical (median)</dt><dd>{formatPct(d.median, 1)}</dd>
      <dt class="text-muted">When it rose</dt><dd>{formatPct(d.avgRose, 1)}</dd>
      <dt class="text-muted">When it fell</dt><dd>{formatPct(d.avgFell, 1)}</dd>
      <dt class="text-muted">Worst</dt><dd>{formatPct(d.worst, 0)}</dd>
      {#if d.range}<dt class="text-muted">Average, 90% range</dt><dd>{formatPct(d.range[0], 1)} to {formatPct(d.range[1], 1)}</dd>{/if}
    </dl>
  {/if}
{/snippet}

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
    {@render detail(r.details?.Any)}
    <p class="mt-2 text-sm text-muted">
      A rating only tells you something about what comes next if it beats this. In a mostly rising market almost every uptrend looks “right”.
      The 90% range shows how much the average could move with a different handful of months: a rating stands out only when its
      range sits clear of this one.
    </p>
  </section>

  <section class="mt-5" aria-labelledby="ratings-heading">
    <h2 id="ratings-heading" class="mb-2 px-1 font-semibold">Overall ratings</h2>
    <ul class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {#each LABELS as label}
        {@const t = r.labels[label]}
        {@const tone = toneOf(label)}
        {@const pct = tone === 'down' ? pctFell(t) : pctRose(t)}
        <li class="px-4 py-3">
          <div class="flex items-baseline justify-between gap-2">
            <span class="font-medium {tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : ''}">{label}</span>
            <span class="text-sm text-muted tabular-nums">{count(t.n)} days</span>
          </div>
          {#if t.n}
            <p class="text-[15px]">
              {tone === 'down' ? 'Lower' : 'Higher'} {horizon} days later <strong>{pct0(pct)}</strong> of the time · average change {avg(t)}
            </p>
            <HitBar pct={pct ?? 0} baseline={tone === 'down' ? baseFell : baseRose} {tone} />
            <p class="mt-1 text-xs text-muted">{vsBase(pct, tone === 'down' ? baseFell : baseRose)}</p>
            {@render detail(r.details?.[label])}
            {#if standing(r.details?.[label])}<p class="mt-1 text-xs text-muted">{standing(r.details?.[label])}</p>{/if}
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
          {#each [{ kind: 'up', tally: t.up }, { kind: 'down', tally: t.down }] as row}
            {@const pct = row.kind === 'down' ? pctFell(row.tally) : pctRose(row.tally)}
            {@const base = row.kind === 'down' ? baseFell : baseRose}
            <div class="mt-2">
              <p class="text-[15px]">
                <span class={row.kind === 'up' ? 'text-up' : 'text-down'}>
                  <span aria-hidden="true">{row.kind === 'up' ? '▲' : '▼'}</span> When {row.kind}:
                </span>
                {#if row.tally.n}
                  {row.kind === 'down' ? 'lower' : 'higher'} {pct0(pct)} of the time
                  <span class="text-sm text-muted">· {count(row.tally.n)} days · average change {avg(row.tally)}</span>
                {:else}
                  <span class="text-muted">didn’t occur</span>
                {/if}
              </p>
              {#if row.tally.n}<HitBar pct={pct ?? 0} baseline={base} tone={row.kind as 'up' | 'down'} />{/if}
            </div>
          {/each}
        </li>
      {/each}
    </ul>
  </section>

  <section class="mt-5" aria-labelledby="conf-heading">
    <h2 id="conf-heading" class="mb-2 px-1 font-semibold">Were ratings right more often when the checks agreed?</h2>
    <div class="rounded-2xl border border-line bg-surface p-4">
      <p class="text-[15px] text-muted">
        How often uptrend and downtrend ratings were followed by a move the same way, by how much the checks agreed. If
        agreement helped, High would beat Low. Across all top-100 coins it has only weakly, over 30 days and not over 7, which is why
        it’s called agreement, not confidence.
      </p>
      <ul class="mt-2 space-y-1.5">
        {#each AGREEMENTS as c}
          {@const h = r.calls[c]}
          <li class="flex items-baseline justify-between gap-3 text-[15px]">
            <span class="font-medium">{c} agreement</span>
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
      <li>Market breadth here covers these {BACKTEST_COINS} coins only (the live ratings use about 90), and past liquidity isn’t available.</li>
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
