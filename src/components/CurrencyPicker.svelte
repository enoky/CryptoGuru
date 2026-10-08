<script lang="ts">
  import { CURRENCIES } from '../../shared/currency';
  import { currencyUnavailable, money, setCurrency } from '../lib/money.svelte';
  import BottomSheet from './BottomSheet.svelte';

  let { variant = 'chip' }: { variant?: 'chip' | 'sidebar' } = $props();
  let open = $state(false);
</script>

<button
  type="button"
  class={variant === 'chip'
    ? 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-2 text-sm font-semibold hover:bg-surface-2'
    : 'mx-3 flex min-h-11 items-center gap-3 rounded-xl px-3 text-muted hover:text-fg'}
  aria-label="Currency: {money.code}. Change currency"
  onclick={() => (open = true)}>
  {variant === 'chip' ? money.code : `Currency: ${money.code}`}
</button>

<BottomSheet bind:open title="Currency">
  <div class="space-y-1" role="radiogroup" aria-label="Currency">
    {#each CURRENCIES as c}
      <button
        type="button"
        role="radio"
        aria-checked={money.code === c.code}
        class="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 text-left hover:bg-surface-2 {money.code === c.code
          ? 'font-semibold text-accent'
          : ''}"
        onclick={() => {
          setCurrency(c.code);
          open = false;
        }}>
        <span><span class="inline-block w-12 font-semibold">{c.code}</span>{c.name}</span>
        {#if money.code === c.code}<span aria-hidden="true">✓</span>{/if}
      </button>
    {/each}
  </div>
  {#if currencyUnavailable()}
    <p class="mt-3 rounded-xl bg-warn-bg p-3 text-sm text-warn" role="status">
      Exchange rates aren’t available right now, so prices are shown in US dollars for the moment.
    </p>
  {/if}
  <p class="mt-3 text-sm text-muted">
    Prices come in US dollars and are converted using CoinGecko’s exchange rates, updated every 30 minutes.
  </p>
</BottomSheet>
