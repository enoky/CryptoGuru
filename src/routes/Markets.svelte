<script lang="ts">
  import type { Asset } from '../../shared/types';
  import { REFRESH_MS } from '../../shared/snapshot';
  import Attribution from '../components/Attribution.svelte';
  import AssetRow from '../components/AssetRow.svelte';
  import BottomSheet from '../components/BottomSheet.svelte';
  import ErrorInline from '../components/ErrorInline.svelte';
  import FreshnessStamp from '../components/FreshnessStamp.svelte';
  import Icon from '../components/Icon.svelte';
  import Logo from '../components/Logo.svelte';
  import MarketStrip from '../components/MarketStrip.svelte';
  import PullToRefresh from '../components/PullToRefresh.svelte';
  import SkeletonRows from '../components/SkeletonRows.svelte';
  import { assets, market, refresh, refreshPrices } from '../lib/market.svelte';
  import { sourceLabel } from '../lib/format';
  import { lsGet, lsSet } from '../lib/storage';
  import { refreshSignals, signalsState, startSignals } from '../lib/signals.svelte';
  import { watchlist } from '../lib/watchlist.svelte';

  type SortKey = 'rank' | 'change24h' | 'change7d' | 'signal' | 'name';
  const SORTS: { key: SortKey; label: string }[] = [
    { key: 'rank', label: 'Market cap' },
    { key: 'change24h', label: '24h change' },
    { key: 'change7d', label: '7d change' },
    { key: 'signal', label: 'Signal score' },
    { key: 'name', label: 'Name' },
  ];

  void startSignals();
  const signalOf = (id: string) => signalsState.doc?.items[id];

  let query = $state('');
  let sort = $state<SortKey>(lsGet<SortKey>('markets:sort', 'rank'));
  let sortOpen = $state(false);
  let showAll = $state(false);
  let disclaimerDismissed = $state(lsGet('disclaimer:dismissed', false));

  const all = $derived(assets());
  const q = $derived(query.trim().toLowerCase());
  const matches = (a: Asset) => !q || a.name.toLowerCase().includes(q) || a.symbol.toLowerCase().includes(q);

  const sorted = $derived.by(() => {
    const list = all.filter(matches);
    const by = (f: (a: Asset) => number | null) => (a: Asset, b: Asset) => (f(b) ?? -Infinity) - (f(a) ?? -Infinity);
    if (sort === 'change24h') list.sort(by((a) => a.change24h));
    else if (sort === 'change7d') list.sort(by((a) => a.change7d));
    else if (sort === 'signal') list.sort(by((a) => signalOf(a.id)?.score ?? null));
    else if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else list.sort((a, b) => a.rank - b.rank);
    return list;
  });
  const visible = $derived(q || showAll ? sorted : sorted.slice(0, 50));
  const watched = $derived(watchlist.ids.map((id) => all.find((a) => a.id === id)).filter((a): a is Asset => !!a));
  const trending = $derived.by(() => {
    const ids = new Set(all.map((a) => a.id));
    return (market.snapshot?.trending?.data ?? []).filter((t) => ids.has(t.id));
  });
  const sortLabel = $derived(SORTS.find((s) => s.key === sort)?.label ?? 'Market cap');

  function chooseSort(key: SortKey) {
    sort = key;
    lsSet('markets:sort', key);
    sortOpen = false;
  }
</script>

<h1 class="sr-only">Markets</h1>

<div class="space-y-3">
  <MarketStrip />

  {#if !disclaimerDismissed}
    <div class="flex items-start gap-2 rounded-2xl border border-line bg-surface p-3 pl-4 text-sm">
      <p class="flex-1 py-1">
        Prices and signals here are for information only, not financial advice.
        <a href="#/about" class="font-medium text-accent underline">How this works</a>
      </p>
      <button
        type="button"
        class="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2"
        aria-label="Dismiss"
        onclick={() => {
          disclaimerDismissed = true;
          lsSet('disclaimer:dismissed', true);
        }}><Icon name="close" size={20} /></button>
    </div>
  {/if}

  <div class="flex gap-2">
    <label class="relative flex-1">
      <span class="sr-only">Search coins</span>
      <Icon name="search" size={18} class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
      <input
        type="search"
        bind:value={query}
        placeholder="Search coins"
        autocomplete="off"
        enterkeyhint="search"
        class="h-11 w-full rounded-xl border border-line bg-surface pr-3 pl-10 text-base outline-none focus:border-accent" />
    </label>
    <button
      type="button"
      class="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-medium"
      onclick={() => (sortOpen = true)}
      aria-label="Sort by {sortLabel}. Change sort">
      <Icon name="sort" size={18} /><span class="max-[379px]:hidden">{sortLabel}</span>
    </button>
  </div>
</div>

{#if market.loading && !market.snapshot}
  <div class="mt-3 overflow-hidden rounded-2xl border border-line bg-surface"><SkeletonRows /></div>
{:else if !market.snapshot?.markets}
  <div class="mt-3">
    <ErrorInline message="We couldn’t load market data. Check your connection and try again." onretry={() => refresh()} />
  </div>
{:else}
  {#if watched.length && !q}
    <section class="mt-5" aria-labelledby="wl-heading">
      <div class="mb-2 flex items-center justify-between px-1">
        <h2 id="wl-heading" class="font-semibold">Your watchlist</h2>
        <a href="#/watchlist" class="inline-flex min-h-11 items-center text-sm font-medium text-accent">Edit</a>
      </div>
      <ul class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {#each watched as a (a.id)}<li><AssetRow asset={a} signal={signalOf(a.id)} /></li>{/each}
      </ul>
    </section>
  {/if}

  <section class="mt-5" aria-labelledby="list-heading">
    <h2 id="list-heading" class="mb-2 px-1 font-semibold">
      {q ? `Results for “${query.trim()}”` : sort === 'rank' ? 'Top coins by market cap' : `Sorted by ${sortLabel.toLowerCase()}`}
    </h2>
    {#if visible.length === 0}
      <div class="rounded-2xl border border-line bg-surface p-5 text-center">
        <p>No coins match “{query.trim()}”.</p>
        <button type="button" class="mt-2 min-h-11 rounded-xl px-4 font-medium text-accent" onclick={() => (query = '')}>Clear search</button>
      </div>
    {:else}
      <ul class="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {#each visible as a, i (a.id)}
          <li><AssetRow asset={a} signal={signalOf(a.id)} /></li>
          {#if i === 9 && !q && sort === 'rank' && trending.length >= 2}
            <li class="bg-surface-2/50 py-3" aria-label="Trending">
              <h3 class="mb-2 px-4 text-sm font-semibold">Trending in the top 100</h3>
              <div class="flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                {#each trending as t (t.id)}
                  <a
                    href="#/asset/{t.id}"
                    class="flex min-h-11 w-36 shrink-0 snap-start items-center gap-2 rounded-xl border border-line bg-surface p-2">
                    <Logo src={t.image} symbol={t.symbol} size={28} />
                    <span class="min-w-0"><span class="block truncate text-sm font-medium">{t.name}</span><span class="block text-xs text-muted">{t.symbol}</span></span>
                  </a>
                {/each}
              </div>
            </li>
          {/if}
        {/each}
      </ul>
      {#if !q && !showAll && sorted.length > 50}
        <button
          type="button"
          class="mt-3 min-h-12 w-full rounded-2xl border border-line bg-surface font-medium"
          onclick={() => (showAll = true)}>Show {sorted.length - 50} more</button>
      {/if}
    {/if}
    <div class="mt-3">
      <FreshnessStamp asOf={market.snapshot.markets.asOf} ttlMs={REFRESH_MS.markets} label="Prices" />
      <p class="mt-1 px-3 text-xs text-muted">Source: {sourceLabel(market.snapshot.markets.source)}{market.prices ? ` · live prices from ${sourceLabel(market.prices.source)}` : ''}</p>
    </div>
  </section>
{/if}

<Attribution />

<BottomSheet bind:open={sortOpen} title="Sort by">
  <div class="space-y-1" role="radiogroup" aria-label="Sort by">
    {#each SORTS as s}
      <button
        type="button"
        role="radio"
        aria-checked={sort === s.key}
        class="flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-left hover:bg-surface-2 {sort === s.key ? 'font-semibold text-accent' : ''}"
        onclick={() => chooseSort(s.key)}>
        {s.label}{#if sort === s.key}<span aria-hidden="true">✓</span>{/if}
      </button>
    {/each}
  </div>
</BottomSheet>

<PullToRefresh onrefresh={() => Promise.all([refresh(), refreshPrices(), refreshSignals()])} />
