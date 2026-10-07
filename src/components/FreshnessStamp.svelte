<script lang="ts">
  import { freshness, formatTime } from '../lib/format';
  import { market, refresh } from '../lib/market.svelte';
  import Icon from './Icon.svelte';

  let { asOf, ttlMs, label = 'Data' }: { asOf: number; ttlMs: number; label?: string } = $props();

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(t);
  });
  const level = $derived(freshness(asOf, ttlMs, now));
</script>

<div
  class="flex items-center justify-between gap-2 rounded-xl px-3 py-1 text-sm {level === 'stale'
    ? 'bg-danger-bg text-danger'
    : level === 'aging'
      ? 'bg-warn-bg text-warn'
      : 'text-muted'}"
  data-freshness={level}>
  <span>
    {#if level === 'stale'}Couldn’t refresh, showing older data · {/if}
    {#if level === 'aging'}May be out of date · {/if}
    {label} as of <time datetime={new Date(asOf).toISOString()}>{formatTime(asOf)}</time>
  </span>
  <button
    type="button"
    class="-mr-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-medium hover:bg-surface-2 disabled:opacity-60"
    onclick={() => refresh()}
    disabled={market.refreshing}>
    <Icon name="refresh" size={16} class={market.refreshing ? 'animate-spin' : ''} />
    {market.refreshing ? 'Refreshing' : 'Refresh'}
  </button>
</div>
