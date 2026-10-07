<script lang="ts">
  let { src, symbol, size = 36 }: { src: string | null; symbol: string; size?: number } = $props();
  let failed = $state(false);
</script>

{#if src && !failed}
  <img
    {src}
    alt=""
    width={size}
    height={size}
    loading="lazy"
    decoding="async"
    referrerpolicy="no-referrer"
    class="shrink-0 rounded-full bg-surface-2"
    style="width:{size}px;height:{size}px"
    onerror={() => (failed = true)} />
{:else}
  <span
    aria-hidden="true"
    class="grid shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-muted"
    style="width:{size}px;height:{size}px">{symbol.slice(0, 3)}</span>
{/if}
