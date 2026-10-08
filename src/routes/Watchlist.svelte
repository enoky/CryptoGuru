<script lang="ts">
  import type { Asset } from '../../shared/types';
  import AssetRow from '../components/AssetRow.svelte';
  import Icon from '../components/Icon.svelte';
  import Logo from '../components/Logo.svelte';
  import SkeletonRows from '../components/SkeletonRows.svelte';
  import PullToRefresh from '../components/PullToRefresh.svelte';
  import SwipeToRemove from '../components/SwipeToRemove.svelte';
  import WatchlistBackup from '../components/WatchlistBackup.svelte';
  import { formatPrice } from '../lib/format';
  import { assets, market, refresh, refreshPrices } from '../lib/market.svelte';
  import { moveWatch, replaceWatch, toggleWatch, watchlist } from '../lib/watchlist.svelte';

  let editing = $state(false);
  let backupOpen = $state(false);
  /** The last coin removed, so it can be put back in the same place. */
  let undo = $state<{ id: string; name: string; index: number } | null>(null);
  let undoTimer: ReturnType<typeof setTimeout> | undefined;

  function remove(a: Asset) {
    const index = watchlist.ids.indexOf(a.id);
    toggleWatch(a.id);
    undo = { id: a.id, name: a.name, index };
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => (undo = null), 6000);
  }

  function undoRemove() {
    if (!undo) return;
    const ids = watchlist.ids.filter((x) => x !== undo!.id);
    ids.splice(Math.min(undo.index, ids.length), 0, undo.id);
    replaceWatch(ids);
    undo = null;
  }
  const all = $derived(assets());
  const items = $derived(watchlist.ids.map((id) => all.find((a) => a.id === id)).filter((a): a is Asset => !!a));
  const suggestions = $derived(all.filter((a) => !watchlist.ids.includes(a.id)).slice(0, 5));
  /** Saved coins that dropped out of the top 100 (or came from an import) and so can't be shown. */
  const hidden = $derived(market.snapshot?.markets ? watchlist.ids.filter((id) => !all.some((a) => a.id === id)) : []);

  // Leave edit mode once the list is empty, so newly added coins show as normal rows.
  $effect(() => {
    if (items.length === 0) editing = false;
  });
</script>

<div class="flex items-center justify-between">
  <h1 class="text-xl font-bold">Watchlist</h1>
  <div class="flex items-center">
    {#if items.length}
      <button type="button" class="min-h-11 rounded-xl px-3 font-medium text-accent" onclick={() => (editing = !editing)} aria-pressed={editing}>
        {editing ? 'Done' : 'Edit'}
      </button>
    {/if}
    <button
      type="button"
      class="grid size-11 shrink-0 place-items-center rounded-full text-lg font-bold hover:bg-surface-2"
      aria-label="Back up or move your watchlist"
      onclick={() => (backupOpen = true)}><span aria-hidden="true">⋯</span></button>
  </div>
</div>
<p class="mt-1 text-sm text-muted">Saved only on this device. No account needed.</p>

{#if hidden.length}
  <div class="mt-3 flex items-start justify-between gap-2 rounded-2xl bg-surface-2 p-3 text-sm" role="status">
    <p class="py-1">
      {hidden.length} saved coin{hidden.length === 1 ? ' isn’t' : 's aren’t'} in today’s top 100, so {hidden.length === 1 ? 'it’s' : 'they’re'}
      hidden: {hidden.join(', ')}.
    </p>
    <button type="button" class="min-h-11 shrink-0 rounded-lg px-2 font-medium text-accent underline" onclick={() => replaceWatch(watchlist.ids.filter((id) => !hidden.includes(id)))}>
      Remove
    </button>
  </div>
{/if}

{#if market.loading && !market.snapshot}
  <div class="mt-4 overflow-hidden rounded-2xl border border-line bg-surface"><SkeletonRows count={3} /></div>
{:else if items.length === 0}
  <div class="mt-4 rounded-2xl border border-line bg-surface p-5">
    <p class="font-medium">Your watchlist is empty</p>
    <p class="mt-1 text-muted">Tap ☆ Add to watchlist on any coin, or start with one of these.</p>
    <p class="text-muted">
      Moving from another phone?
      <button type="button" class="inline-flex min-h-11 items-center font-medium text-accent underline" onclick={() => (backupOpen = true)}>Load a saved file</button>
    </p>
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
        <button type="button" class="grid size-11 shrink-0 place-items-center rounded-full hover:bg-surface-2 disabled:opacity-30" disabled={i === 0} onclick={() => moveWatch(a.id, -1)} aria-label="Move {a.name} up"><Icon name="up" /></button>
        <button type="button" class="grid size-11 shrink-0 place-items-center rounded-full hover:bg-surface-2 disabled:opacity-30" disabled={i === items.length - 1} onclick={() => moveWatch(a.id, 1)} aria-label="Move {a.name} down"><Icon name="down" /></button>
        <button type="button" class="grid size-11 shrink-0 place-items-center rounded-full text-danger hover:bg-surface-2" onclick={() => remove(a)} aria-label="Remove {a.name}"><Icon name="close" /></button>
      </li>
    {/each}
  </ul>
{:else}
  <ul class="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
    {#each items as a (a.id)}
      <li><SwipeToRemove onremove={() => remove(a)}><AssetRow asset={a} /></SwipeToRemove></li>
    {/each}
  </ul>
  <p class="mt-2 px-1 text-sm text-muted">Tip: swipe a coin left to remove it.</p>
{/if}

{#if undo}
  <div
    role="status"
    class="fixed inset-x-4 bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom)+12px)] z-20 mx-auto flex max-w-md items-center justify-between gap-2 rounded-2xl bg-fg py-1 pr-1 pl-4 text-bg shadow-lg lg:bottom-6">
    <span>Removed {undo.name}</span>
    <button type="button" class="min-h-11 rounded-xl px-3 font-semibold underline" onclick={undoRemove}>Undo</button>
  </div>
{/if}

<PullToRefresh onrefresh={() => Promise.all([refresh(), refreshPrices()])} />

<WatchlistBackup bind:open={backupOpen} />
