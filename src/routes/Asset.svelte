<script lang="ts">
  import { annualizedVolatility, volatilityLabel } from '../../shared/series';
  import { computeSignal, hasPeggedPrice, isPeggedSymbol } from '../../shared/signals';
  import { RANGES, type CandleSet, type Range } from '../../shared/types';
  import Attribution from '../components/Attribution.svelte';
  import ChangeText from '../components/ChangeText.svelte';
  import ErrorInline from '../components/ErrorInline.svelte';
  import Icon from '../components/Icon.svelte';
  import Logo from '../components/Logo.svelte';
  import PriceChart from '../components/PriceChart.svelte';
  import SignalCard from '../components/SignalCard.svelte';
  import StatTile from '../components/StatTile.svelte';
  import { formatCompact, formatPct, formatPrice, formatTime, formatMoneyCompact, sourceLabel } from '../lib/format';
  import { findAsset, getCandles, market } from '../lib/market.svelte';
  import { back } from '../lib/router.svelte';
  import { lsGet, lsSet } from '../lib/storage';
  import { signalsState, startSignals } from '../lib/signals.svelte';
  import { isWatched, toggleWatch } from '../lib/watchlist.svelte';

  void startSignals();

  let { id }: { id: string } = $props();

  const LABEL: Record<Range, string> = { '7d': '7 days', '30d': '30 days', '1y': '1 year' };

  const asset = $derived(findAsset(id));
  let range = $state<Range>(lsGet<Range>('chart:range', '30d'));
  let chart = $state<CandleSet | null>(null);
  let chartError = $state<string | null>(null);
  let chartLoading = $state(false);
  let retryCount = $state(0);

  // Load candles as soon as the page opens (they don't wait for market data), and when the range changes.
  $effect(() => {
    const r = range;
    void retryCount;
    let cancelled = false;
    chartLoading = true;
    chartError = null;
    getCandles(id, r, (cached) => {
      if (!cancelled) chart = cached;
    })
      .then((set) => {
        if (!cancelled) chart = set;
      })
      .catch(() => {
        if (!cancelled) chartError = 'We couldn’t load the chart right now.';
      })
      .finally(() => {
        if (!cancelled) chartLoading = false;
      });
    return () => (cancelled = true);
  });

  // Volatility and signals need daily candles: fetch the 1-year set once per coin.
  let daily = $state<CandleSet | null>(null);
  let dailyFailed = $state(false);
  $effect(() => {
    let cancelled = false;
    daily = null;
    dailyFailed = false;
    // Not needed for the top of the page (the server's rating usually covers it), so it waits until
    // the browser is idle rather than sharing a slow connection with what's on screen.
    const whenIdle = (cb: () => void) =>
      'requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 300);
    whenIdle(() => {
      if (cancelled) return;
      getCandles(id, '1y', () => {})
      .then((set) => {
        if (!cancelled) daily = set;
      })
      .catch(() => {
        if (!cancelled) dailyFailed = true;
      });
    });
    return () => (cancelled = true);
  });

  const volatility = $derived(daily ? annualizedVolatility(daily.candles) : null);
  /** Stablecoins, gold tokens and anything else whose price barely moves (the server's check, or this page's own). */
  const pegged = $derived(
    (asset ? isPeggedSymbol(asset.symbol) : false) || signalsState.doc?.pegged[id] != null || (daily ? hasPeggedPrice(daily.candles) : false),
  );
  /**
   * The server's rating when it's recent, so this page and the Signals list always agree.
   * Otherwise (missing, stale, or the server is down) it's worked out here from the page's own chart data.
   */
  const signal = $derived.by(() => {
    if (pegged) return null;
    const server = signalsState.doc?.items[id];
    if (server && Date.now() - server.asOf < 3 * 60 * 60_000) return server;
    // The page's own calculation takes Fear & Greed and liquidity from market data, and Bitcoin's
    // return and market breadth from the server's ratings when they've loaded.
    if (daily && market.snapshot) {
      const ctx = signalsState.doc?.market;
      const turnover = asset?.volume24h != null && asset.marketCap ? (asset.volume24h / asset.marketCap) * 100 : null;
      const local = computeSignal(
        id,
        daily.candles,
        daily.source,
        {
          fearGreed: market.snapshot.fearGreed?.data.value ?? null,
          btcReturn90d: ctx?.btcReturn90d ?? null,
          breadth: ctx?.breadth ?? null,
          turnover,
          athChangePct: asset?.athChangePct ?? null,
        },
        daily.asOf,
      );
      if (local) return local;
    }
    return server ?? null;
  });

  function chooseRange(r: Range) {
    range = r;
    lsSet('chart:range', r);
  }

  const rangeChange = $derived.by(() => {
    const c = chart?.range === range ? chart.candles : null;
    if (!c || c.length < 2) return null;
    return ((c[c.length - 1].c - c[0].c) / c[0].c) * 100;
  });
  const watched = $derived(isWatched(id));
</script>

{#if !asset && !market.loading}
  <div class="rounded-2xl border border-line bg-surface p-5 text-center">
    <h1 class="text-lg font-semibold">Coin not found</h1>
    <p class="mt-1 text-muted">We only cover the top 100 coins by market cap.</p>
    <a href="#/" class="mt-3 inline-flex min-h-11 items-center rounded-xl px-4 font-medium text-accent">Back to Markets</a>
  </div>
{:else}
  <!-- Each section shows as soon as its own data arrives; placeholders keep the same size so nothing jumps. -->
  <div class="flex h-11 items-center gap-2">
    <button type="button" class="-ml-2 grid size-11 shrink-0 place-items-center rounded-full hover:bg-surface-2" onclick={() => back()} aria-label="Back">
      <Icon name="back" />
    </button>
    {#if asset}
      <Logo src={asset.image} symbol={asset.symbol} size={32} />
      <div class="min-w-0">
        <h1 class="truncate text-lg leading-tight font-semibold">{asset.name}</h1>
        <div class="text-sm text-muted">{asset.symbol} · Rank #{asset.rank}</div>
      </div>
    {:else}
      <div class="size-8 animate-pulse rounded-full bg-surface-2" aria-hidden="true"></div>
      <div class="space-y-1.5" aria-busy="true" aria-label="Loading">
        <div class="h-4 w-28 animate-pulse rounded bg-surface-2"></div>
        <div class="h-3 w-20 animate-pulse rounded bg-surface-2"></div>
      </div>
    {/if}
  </div>

  <div class="mt-3 min-h-[58px]">
    {#if asset}
      <div class="text-[28px] leading-tight font-bold tabular-nums">{formatPrice(asset.price)}</div>
      <div class="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm">
        <ChangeText value={asset.change24h} class="font-medium" /><span class="text-muted">24h</span>
        {#if market.snapshot?.markets}<span class="text-muted">· as of {formatTime(market.prices?.asOf ?? market.snapshot.markets.asOf)}</span>{/if}
      </div>
    {:else}
      <div class="h-8 w-40 animate-pulse rounded-lg bg-surface-2" aria-hidden="true"></div>
      <div class="mt-2 h-4 w-24 animate-pulse rounded bg-surface-2" aria-hidden="true"></div>
    {/if}
  </div>

  <section class="mt-4 rounded-2xl border border-line bg-surface p-3" aria-label="Price chart">
    <div class="mb-2 flex items-center justify-between gap-2">
      <div class="flex gap-1" role="group" aria-label="Chart range">
        {#each RANGES as r}
          <button
            type="button"
            aria-pressed={range === r}
            class="min-h-11 min-w-14 rounded-xl px-3 text-sm font-semibold uppercase {range === r ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-surface-2'}"
            onclick={() => chooseRange(r)}>{r}</button>
        {/each}
      </div>
      {#if rangeChange != null}
        <div class="text-right text-sm"><ChangeText value={rangeChange} /><span class="block text-xs text-muted">{LABEL[range]}</span></div>
      {/if}
    </div>
    {#if chart && chart.range === range}
      <div class:opacity-60={chartLoading}>
        <PriceChart candles={chart.candles} {range} name={asset?.name ?? 'Price'} />
      </div>
      <p class="mt-1 text-xs text-muted">Chart data: {sourceLabel(chart.source)} · {formatTime(chart.asOf)}</p>
    {:else if chartError}
      <ErrorInline message={chartError} onretry={() => retryCount++} />
    {:else}
      <div class="h-60 animate-pulse rounded-xl bg-surface-2 sm:h-80" aria-busy="true" aria-label="Loading chart"></div>
      <!-- Holds the caption's line so the page doesn't move when the chart arrives. -->
      <p class="mt-1 text-xs text-muted" aria-hidden="true">&nbsp;</p>
    {/if}
  </section>

  <div class="mt-4">
    {#if pegged}
      <section class="rounded-2xl border border-line bg-surface p-4 text-[15px]" aria-label="Signals">
        <h2 class="text-sm font-medium text-muted">Signals</h2>
        <p class="mt-1">
          {asset?.name} is a pegged asset: its price is designed to track something outside crypto, such as the US dollar, a
          money-market fund or gold, so trend signals don’t apply.
        </p>
      </section>
    {:else if signal}
      <SignalCard {signal} name={asset?.name ?? ''} />
    {:else if (daily || dailyFailed) && asset}
      <section class="rounded-2xl border border-line bg-surface p-4 text-[15px]" aria-label="Signals">
        <h2 class="text-sm font-medium text-muted">Signals</h2>
        <p class="mt-1">{daily ? 'Not enough price history to rate this coin yet.' : 'Signals aren’t available right now. Try again in a few minutes.'}</p>
      </section>
    {:else}
      <!-- About the height of a signal card, so the stats below don't jump when it arrives. -->
      <div class="h-[330px] animate-pulse rounded-2xl bg-surface-2" aria-busy="true" aria-label="Loading signals"></div>
    {/if}
  </div>

  <section class="mt-4" aria-labelledby="stats-heading">
    <h2 id="stats-heading" class="mb-2 px-1 font-semibold">Key stats</h2>
    {#if asset}
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatTile label="Market cap" term="marketCap">
          {formatMoneyCompact(asset.marketCap)}
          {#snippet sub()}Rank #{asset.rank}{/snippet}
        </StatTile>
        <StatTile label="24h volume" term="volume">{formatMoneyCompact(asset.volume24h)}</StatTile>
        <StatTile label="Circulating" term="circulating">
          {formatCompact(asset.circulatingSupply)}
          {#snippet sub()}{asset.symbol}{/snippet}
        </StatTile>
        <StatTile label="Max supply" term="maxSupply">
          {asset.maxSupply ? formatCompact(asset.maxSupply) : 'No limit'}
          {#snippet sub()}{asset.maxSupply && asset.circulatingSupply
              ? `${((asset.circulatingSupply / asset.maxSupply) * 100).toFixed(0)}% issued`
              : asset.symbol}{/snippet}
        </StatTile>
        <StatTile label="All-time high" term="ath">
          {formatPrice(asset.ath)}
          {#snippet sub()}{asset.athChangePct != null ? `${formatPct(asset.athChangePct, 0)} from ATH` : '—'}{/snippet}
        </StatTile>
        <StatTile label="Volatility" term="volatility">
          {volatility != null ? `${volatility.toFixed(0)}%` : '—'}
          {#snippet sub()}{volatility != null ? `${volatilityLabel(volatility)} · 30 days` : 'Calculating…'}{/snippet}
        </StatTile>
        <StatTile label="1h change"><ChangeText value={asset.change1h} /></StatTile>
        <StatTile label="7d change"><ChangeText value={asset.change7d} /></StatTile>
      </div>
    {:else}
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-hidden="true">
        {#each { length: 8 } as _}<div class="h-[100px] animate-pulse rounded-2xl bg-surface-2"></div>{/each}
      </div>
    {/if}
  </section>

  <div class="sticky bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom)+12px)] z-10 mt-5 lg:bottom-6">
    <button
      type="button"
      aria-pressed={watched}
      class="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl font-semibold shadow-lg {watched
        ? 'border border-line bg-surface text-fg'
        : 'bg-accent text-accent-fg'}"
      onclick={() => toggleWatch(id)}>
      <Icon name="star" filled={watched} size={20} />
      {watched ? 'In your watchlist · Remove' : 'Add to watchlist'}
    </button>
  </div>

  <p class="mt-4 px-1 text-sm text-muted">Market data: {sourceLabel(market.snapshot?.markets?.source)}{market.prices ? ` · Live price: ${sourceLabel(market.prices.source)}` : ''}</p>
  <Attribution />
{/if}
