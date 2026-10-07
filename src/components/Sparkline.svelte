<script lang="ts">
  let { values, width = 64, height = 28, class: cls = '' }: { values: number[]; width?: number; height?: number; class?: string } =
    $props();

  const points = $derived.by(() => {
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return values
      .map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
      .join(' ');
  });
  const up = $derived(values.length > 1 && values[values.length - 1] >= values[0]);
</script>

{#if points}
  <svg
    {width}
    {height}
    viewBox="0 0 {width} {height}"
    aria-hidden="true"
    class="shrink-0 {up ? 'text-up' : 'text-down'} {cls}"
    preserveAspectRatio="none">
    <polyline {points} fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round" />
  </svg>
{:else}
  <span class="shrink-0 {cls}" style="width:{width}px" aria-hidden="true"></span>
{/if}
