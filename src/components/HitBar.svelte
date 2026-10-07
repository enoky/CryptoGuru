<script lang="ts">
  /** A percentage bar with a tick marking the "any day" baseline. Purely visual: the numbers are in the text beside it. */
  let { pct, baseline, tone }: { pct: number; baseline: number; tone: 'bullish' | 'bearish' | 'neutral' } = $props();
</script>

<div class="relative mt-1.5 h-2 rounded-full bg-surface-2" aria-hidden="true">
  <div
    class="absolute inset-y-0 left-0 rounded-full {tone === 'bullish' ? 'bg-up' : tone === 'bearish' ? 'bg-down' : 'bg-muted'}"
    style="width:{Math.max(0, Math.min(pct, 100))}%">
  </div>
  <div class="absolute top-[-4px] h-4 w-0.5 rounded bg-fg" style="left:calc({Math.max(0, Math.min(baseline, 100))}% - 1px)"></div>
</div>
