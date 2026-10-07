<script lang="ts">
  import type { Asset } from '../../shared/types';
  import AssetRow from '../components/AssetRow.svelte';
  import Icon from '../components/Icon.svelte';
  import Logo from '../components/Logo.svelte';
  import SkeletonRows from '../components/SkeletonRows.svelte';
  import { formatPrice } from '../lib/format';
  import { assets, market } from '../lib/market.svelte';
  import { moveWatch, toggleWatch, watchlist } from '../lib/watchlist.svelte';

  let editing = $state(false);
  const all = $derived(assets());
  const items = $derived(watchlist.ids.map((id) => all.find((a) => a.id === id)).filter((a): a is Asset => !!a));
  const suggestions = $derived(all.filter((a) => !watchlist.ids.includes(a.id)).slice(0, 5));

  // Leave edit mode once the list is empty, so newly added coins show as normal rows.
  $effect(() => {
    if (items.length === 0) editing = false;
  });
</script>

<div class="flex items-center justify-between">
  <h1 class="text-xl font-bold">Watchlist</h1>
  {#if items.length}
    <button type="button" class="min-h-11 rounded-xl px-3 font-medium text-accent" onclick={() => (editing = !editing)} aria-pressed={editing}>
      {editing ? 'Done' : 'Edit'}
    </button>
  {/if}
</div>
<p class="mt-1 text-sm text-muted">Saved only on this device. No account needed.</p>

{#if market.loading && !market.snapshot}
  <div class="mt-4 overflow-hidden rounded-2xl border border-line bg-surface"><SkeletonRows count={3} /></div>
{:else if items.length === 0}
  <div class="mt-4 rounded-2xl border border-line bg-surface p-5">
    <p class="font-medium">Your watchlist is empty</p>
    <p class="mt-1 text-muted">Tap ☆ Add to watchlist on any coin, or start with one of these:</p>
    <ul class="mt-3 divide-y divide-line">
      {#each suggestions as a (a.id)}
        <li class="flex min-h-14 items-center gap-3">
          <Logo src={a.image} symbol={a.symbol} size={28} />
          <span class="min-w-0 flex-1 truncate">{a.name} <span class="text-sm text-muted">{formatPrice(a.price)}</span></span>
          <button
            type="button"
            class="inline-flex min-h-11 items-center gap-1 rounded-xl border border-line px-3 text-sm font-medium"
            onclick={() => toggleWatch(a.id)}
            aria-label="Add {a.name} to watchlist"><Icon name="plus" size={16} />Add</button>
        </li>
      {/each}
    </ul>
  </div>
{:else if editing}
  <ul class="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
    {#each items as a, i (a.id)}
      <li class="flex min-h-16 items-center gap-2 py-2 pr-2 pl-4">
        <Logo src={a.image} symbol={a.symbol} size={28} />
        <span class="min-w-0 flex-1 truncate font-medium">{a.name}</span>
        <button type="button" class="grid size-11 place-items-center rounded-full hover:bg-surface-2 disabled:opacity-30" disabled={i === 0} onclick={() => moveWatch(a.id, -1)} aria-label="Move {a.name} up"><Icon name="up" /></button>
        <button type="button" class="grid size-11 place-items-center rounded-full hover:bg-surface-2 disabled:opacity-30" disabled={i === items.length - 1} onclick={() => moveWatch(a.id, 1)} aria-label="Move {a.name} down"><Icon name="down" /></button>
        <button type="button" class="grid size-11 place-items-center rounded-full text-danger hover:bg-surface-2" onclick={() => toggleWatch(a.id)} aria-label="Remove {a.name}"><Icon name="close" /></button>
      </li>
    {/each}
  </ul>
{:else}
  <ul class="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
    {#each items as a (a.id)}<li><AssetRow asset={a} /></li>{/each}
  </ul>
{/if}
