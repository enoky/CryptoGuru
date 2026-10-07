<script lang="ts">
  import { formatTime } from '../lib/format';
  import { market, refresh } from '../lib/market.svelte';
  import { applyUpdate, pwa } from '../lib/pwa.svelte';
  import Icon from './Icon.svelte';

  const asOf = $derived(market.snapshot?.markets?.asOf);
</script>

{#if !market.online}
  <div role="status" class="flex items-center gap-2 bg-warn-bg px-4 py-2 text-sm text-warn">
    <Icon name="offline" size={18} />
    You’re offline{asOf ? ` — showing saved data from ${formatTime(asOf)}` : ''}.
  </div>
{:else if market.error && market.snapshot}
  <div role="status" class="flex items-center justify-between gap-2 bg-warn-bg px-4 py-1 text-sm text-warn">
    <span>Couldn’t refresh{asOf ? ` — showing data from ${formatTime(asOf)}` : ''}.</span>
    <button type="button" class="min-h-11 rounded-lg px-2 font-medium underline" onclick={() => refresh()}>Retry</button>
  </div>
{/if}

{#if pwa.updateReady}
  <div role="status" class="flex items-center justify-between gap-2 bg-surface-2 px-4 py-1 text-sm">
    <span>A new version of CryptoGuru is ready.</span>
    <button type="button" class="min-h-11 rounded-lg px-2 font-medium text-accent underline" onclick={applyUpdate}>Reload</button>
  </div>
{/if}
