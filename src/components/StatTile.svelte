<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Term } from '../lib/glossary';
  import InfoButton from './InfoButton.svelte';

  let { label, term, children, sub }: { label: string; term?: Term; children: Snippet; sub?: Snippet } = $props();
</script>

<div class="min-w-0 rounded-2xl border border-line bg-surface p-3">
  <div class="flex items-center justify-between gap-1 text-sm text-muted">
    <span class="truncate">{label}</span>
    {#if term}<InfoButton {term} />{/if}
  </div>
  <div class="mt-1 truncate text-lg font-semibold tabular-nums">{@render children()}</div>
  {#if sub}<div class="truncate text-sm text-muted">{@render sub()}</div>{/if}
</div>
