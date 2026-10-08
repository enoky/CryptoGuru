<script lang="ts">
  import type { Tone } from '../../shared/signals';
  import { formatScore } from '../lib/explain';

  let { score, tone, class: cls = '' }: { score: number; tone: Tone; class?: string } = $props();
  const width = $derived(Math.min(Math.abs(score), 100) / 2);
</script>

<div
  role="img"
  aria-label="Score {formatScore(score)} on a scale from −100 (bearish) to +100 (bullish)"
  class="relative h-2 rounded-full bg-surface-2 {cls}">
  <div class="absolute top-[-3px] left-1/2 h-3.5 w-0.5 -translate-x-1/2 rounded bg-line"></div>
  <div
    class="absolute top-0 h-2 {tone === 'bullish' ? 'bg-up' : tone === 'bearish' ? 'bg-down' : 'bg-muted'} {score >= 0
      ? 'rounded-r-full'
      : 'rounded-l-full'}"
    style="left:{score >= 0 ? 50 : 50 - width}%;width:{Math.max(width, 1)}%">
  </div>
</div>
<div class="mt-1 flex justify-between text-xs text-muted" aria-hidden="true">
  <span>Bearish</span><span>Bullish</span>
</div>
