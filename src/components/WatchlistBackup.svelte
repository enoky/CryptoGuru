<script lang="ts">
  import { mergeWatchlist, parseWatchlistFile, serializeWatchlist, WATCHLIST_FILE } from '../lib/watchlistFile';
  import { replaceWatch, watchlist } from '../lib/watchlist.svelte';
  import BottomSheet from './BottomSheet.svelte';

  let { open = $bindable(false) }: { open?: boolean } = $props();
  let fileInput: HTMLInputElement;
  let message = $state<{ ok: boolean; text: string } | null>(null);

  function exportFile() {
    const blob = new Blob([serializeWatchlist(watchlist.ids)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: WATCHLIST_FILE });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    message = { ok: true, text: `Saved ${watchlist.ids.length} coin${watchlist.ids.length === 1 ? '' : 's'} to ${WATCHLIST_FILE}.` };
  }

  async function importFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    (e.currentTarget as HTMLInputElement).value = '';
    if (!file) return;
    try {
      if (file.size > 100_000) throw new Error('That file is too big to be a watchlist.');
      const { ids, added, already } = mergeWatchlist(watchlist.ids, parseWatchlistFile(await file.text()));
      replaceWatch(ids);
      message = {
        ok: true,
        text: added
          ? `Added ${added} coin${added === 1 ? '' : 's'}${already ? ` (${already} already in your watchlist)` : ''}.`
          : 'Every coin in that file is already in your watchlist.',
      };
    } catch (err) {
      message = { ok: false, text: err instanceof Error ? err.message : 'Couldn’t read that file.' };
    }
  }
</script>

<BottomSheet bind:open title="Back up or move your watchlist">
  <p class="text-[15px] text-muted">
    Your watchlist is stored only on this device. Save it as a file to keep a backup or to move it to another phone or browser.
  </p>
  <div class="mt-4 grid gap-2">
    <button
      type="button"
      class="min-h-12 rounded-xl bg-accent font-semibold text-accent-fg disabled:opacity-50"
      disabled={watchlist.ids.length === 0}
      onclick={exportFile}>Save watchlist to a file</button>
    <button type="button" class="min-h-12 rounded-xl border border-line font-semibold" onclick={() => fileInput.click()}>
      Add coins from a file
    </button>
    <input bind:this={fileInput} type="file" accept=".json,application/json" class="sr-only" tabindex="-1" aria-hidden="true" onchange={importFile} />
  </div>
  {#if message}
    <p role="status" class="mt-3 rounded-xl p-3 text-[15px] {message.ok ? 'bg-surface-2' : 'bg-danger-bg text-danger'}">{message.text}</p>
  {/if}
  <p class="mt-3 text-sm text-muted">Importing adds coins; it never removes any.</p>
</BottomSheet>
