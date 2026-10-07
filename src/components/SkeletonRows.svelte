<script lang="ts">
  let { count = 8 }: { count?: number } = $props();
</script>

<div aria-busy="true" aria-label="Loading">
  {#each { length: count } as _}
    <div class="grid min-h-16 grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5">
      <div class="size-9 animate-pulse rounded-full bg-surface-2"></div>
      <div class="space-y-2">
        <div class="h-4 w-28 animate-pulse rounded bg-surface-2"></div>
        <div class="h-3 w-16 animate-pulse rounded bg-surface-2"></div>
      </div>
      <div class="space-y-2">
        <div class="ml-auto h-4 w-20 animate-pulse rounded bg-surface-2"></div>
        <div class="ml-auto h-3 w-12 animate-pulse rounded bg-surface-2"></div>
      </div>
    </div>
  {/each}
</div>
