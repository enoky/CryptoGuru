<script lang="ts">
  import type { Sig } from '../../shared/signals';

  let { sig }: { sig: Sig | null } = $props();
</script>

<span
  class="grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold {sig === 1
    ? 'bg-up/10 text-up'
    : sig === -1
      ? 'bg-down/10 text-down'
      : 'bg-surface-2 text-muted'}">
  <span aria-hidden="true">{sig === 1 ? '▲' : sig === -1 ? '▼' : sig === 0 ? '–' : '○'}</span>
  <span class="sr-only">{sig === 1 ? 'Bullish:' : sig === -1 ? 'Bearish:' : sig === 0 ? 'Neutral:' : 'Not enough data:'}</span>
</span>
