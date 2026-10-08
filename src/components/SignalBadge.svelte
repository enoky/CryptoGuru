<script lang="ts">
  import type { CoinSignal } from '../../shared/signals';
  import { SHORT_LABEL } from '../lib/explain';

  let { signal }: { signal: CoinSignal } = $props();
</script>

<span
  class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap {signal.tone === 'bullish'
    ? 'bg-up/10 text-up'
    : signal.tone === 'bearish'
      ? 'bg-down/10 text-down'
      : 'bg-surface-2 text-muted'}">
  <span aria-hidden="true">{signal.tone === 'bullish' ? '▲' : signal.tone === 'bearish' ? '▼' : '–'}</span>
  {SHORT_LABEL[signal.label]}
</span>
