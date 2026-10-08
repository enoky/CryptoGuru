<script lang="ts">
  import { direction, formatPct } from '../lib/format';

  let { value, class: cls = '' }: { value: number | null | undefined; class?: string } = $props();
  const dir = $derived(direction(value));
</script>

<span
  class="inline-flex items-center gap-0.5 whitespace-nowrap tabular-nums {dir === 'up'
    ? 'text-up'
    : dir === 'down'
      ? 'text-down'
      : 'text-muted'} {cls}">
  {#if dir !== 'flat'}<span aria-hidden="true" class="text-[0.75em]">{dir === 'up' ? '▲' : '▼'}</span>{/if}
  <span class="sr-only">{dir === 'up' ? 'up' : dir === 'down' ? 'down' : ''}</span>
  {formatPct(value)}
</span>
