<script lang="ts">
  import { INDICATORS, THRESHOLDS, type CoinSignal } from '../../shared/signals';
  import type { Asset } from '../../shared/types';
  import BottomSheet from '../components/BottomSheet.svelte';
  import ErrorInline from '../components/ErrorInline.svelte';
  import Logo from '../components/Logo.svelte';
  import SkeletonRows from '../components/SkeletonRows.svelte';
  import { formatScore } from '../lib/explain';
  import { formatTime } from '../lib/format';
  import { assets, market } from '../lib/market.svelte';
  import { refreshSignals, signalsState, startSignals } from '../lib/signals.svelte';
  import { lsGet, lsSet } from '../lib/storage';

  void startSignals();

  type FilterKey = 'all' | 'bullish' | 'bearish' | 'oversold' | 'overbought' | 'above200' | 'volume';
  const FILTERS: { key: FilterKey; label: string; test: (s: CoinSignal) => boolean }[] = [
    { key: 'all', label: 'All', test: () => true },
    { key: 'bullish', label: 'Bullish', test: (s) => s.tone === 'bullish' },
    { key: 'bearish', label: 'Bearish', test: (s) => s.tone === 'bearish' },
    { key: 'oversold', label: 'Oversold', test: (s) => s.metrics.rsi != null && s.metrics.rsi < THRESHOLDS.rsiOversold },
    { key: 'overbought', label: 'Overbought', test: (s) => s.metrics.rsi != null && s.metrics.rsi > THRESHOLDS.rsiOverbought },
    { key: 'above200', label: 'Above 200-day avg', test: (s) => s.signals.trend === 1 },
    { key: 'volume', label: 'Unusual volume', test: (s) => s.metrics.volumeRatio != null && s.metrics.volumeRatio > THRESHOLDS.volumeRatio },
  ];

  let filter = $state<FilterKey>(lsGet<FilterKey>('signals:filter', 'all'));
  let howOpen = $state(false);

  const byId = $derived(new Map(assets().map((a) => [a.id, a])));
  const rows = $derived.by(() => {
    const items = Object.values(signalsState.doc?.items ?? {});
    const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0];
    return items
      .map((s) => ({ s, a: byId.get(s.id) }))
      .filter((r): r is { s: CoinSignal; a: Asset } => !!r.a && f.test(r.s))
      .sort((x, y) => (filter === 'bearish' ? x.s.score - y.s.score : y.s.score - x.s.score) || x.a.rank - y.a.rank);
  });
  const total = $derived(Object.keys(signalsState.doc?.items ?? {}).length);
  const asOf = $derived(signalsState.doc?.asOf ?? 0);
  const stale = $derived(asOf > 0 && Date.now() - asOf > 6 * 60 * 60_000);

  function choose(key: FilterKey) {
    filter = key;
    lsSet('signals:filter', key);
  }
</script>

<h1 class="text-xl font-bold">Signals</h1>
<p class="mt-1 text-[15px] text-muted">
  What common technical indicators say about each coin, in plain English. Not predictions or financial advice.
</p>
<button type="button" class="-ml-1 inline-flex min-h-11 items-center px-1 text-[15px] font-medium text-accent underline" onclick={() => (howOpen = true)}>
  How signals work
</button>

<div class="-mx-4 mt-1 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="Filter">
  {#each FILTERS as f}
    <button
      type="button"
      aria-pressed={filter === f.key}
      class="min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium whitespace-nowrap {filter === f.key
        ? 'border-accent bg-accent text-accent-fg'
        : 'border-line bg-surface'}"
      onclick={() => choose(f.key)}>{f.label}</button>
  {/each}
</div>

{#if signalsState.loading && !signalsState.doc}
  <div class="mt-3 overflow-hidden rounded-2xl border border-line bg-surface"><SkeletonRows /></div>
{:else if !signalsState.doc}
  <div class="mt-3">
    <ErrorInline message="Signals are unavailable right now. Each coin’s page still works out its own signals." onretry={() => refreshSignals()} />
  </div>
{:else if total === 0}
  <div class="mt-3 rounded-2xl border border-line bg-surface p-5">
    <p class="font-medium">Signals are being calculated</p>
    <p class="mt-1 text-muted">Coins are rated in small batches every 10 minutes. Check back shortly; each coin’s page already shows its own signals.</p>
  </div>
{:else}
  <p class="mt-3 px-1 text-sm text-muted" aria-live="polite">
    {rows.length} of {total} coins{filter === 'bearish' ? ', most bearish first' : filter === 'all' ? ', most bullish first' : ''}
  </p>
  {#if rows.length === 0}
    <div class="mt-2 rounded-2xl border border-line bg-surface p-5 text-center">
      <p>No coins match this filter right now.</p>
      <button type="button" class="mt-2 min-h-11 rounded-xl px-4 font-medium text-accent" onclick={() => choose('all')}>Show all</button>
    </div>
  {:else}
    <ul class="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {#each rows as { s, a } (s.id)}
        <li>
          <a
            href="#/asset/{a.id}"
            class="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 hover:bg-surface-2"
            aria-label="{a.name}: {s.label}, {s.confidence.toLowerCase()} confidence, score {formatScore(s.score)}">
            <Logo src={a.image} symbol={a.symbol} />
            <div class="min-w-0">
              <div class="truncate font-medium">{a.name}</div>
              <div class="truncate text-sm {s.tone === 'bullish' ? 'text-up' : s.tone === 'bearish' ? 'text-down' : 'text-muted'}">
                <span aria-hidden="true">{s.tone === 'bullish' ? '▲' : s.tone === 'bearish' ? '▼' : '–'}</span>
                {s.label}<span class="text-muted">{` · ${s.confidence}`}</span>
              </div>
            </div>
            <div class="text-right">
              <div class="text-[17px] font-semibold tabular-nums">{formatScore(s.score)}</div>
              <div class="text-xs text-muted">score</div>
            </div>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
  <p class="mt-3 px-1 text-sm {stale ? 'text-warn' : 'text-muted'}">
    {stale ? 'May be out of date · ' : ''}Ratings updated {formatTime(asOf)}. Each coin is re-rated about every 2 hours.
    Stablecoins aren’t rated: their price is designed to stay at US$1.
  </p>
{/if}

{#if !market.snapshot && !market.loading}
  <p class="mt-3 text-sm text-muted">Market data is needed to show coin names; it hasn’t loaded.</p>
{/if}

<BottomSheet bind:open={howOpen} title="How signals work">
  <p class="text-[15px]">
    Each coin gets six simple checks on its daily prices. Each check is bullish (+1), bearish (−1) or neutral (0), and counts by its
    weight:
  </p>
  <ul class="mt-3 space-y-2 text-[15px]">
    {#each INDICATORS as i}
      <li><span class="font-medium">{i.name}</span> <span class="text-muted">· {i.weight}%</span></li>
    {/each}
  </ul>
  <p class="mt-3 text-[15px]">
    The weighted total gives a score from −100 to +100. +15 or more leans bullish and +50 or more is strong; the same below zero is
    bearish. Confidence is how many checks agree, lowered when a coin is very volatile or has little history.
  </p>
  <p class="mt-3 text-[15px] text-muted">
    These checks only look at past prices and volume. They ignore news, fundamentals and regulation, they lag behind the price, and
    they often fail in sideways markets. They are not predictions or financial advice.
  </p>
</BottomSheet>
