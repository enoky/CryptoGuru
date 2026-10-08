<script lang="ts">
  import Icon from './Icon.svelte';

  let { message, onretry }: { message: string; onretry?: () => void } = $props();
</script>

<div role="alert" class="flex items-start gap-3 rounded-2xl bg-danger-bg p-4 text-danger">
  <Icon name="alert" class="mt-0.5 shrink-0" />
  <div class="flex-1">
    <p>{message}</p>
    {#if onretry}
      <button type="button" class="mt-2 min-h-11 rounded-xl bg-surface px-4 font-medium text-fg" onclick={onretry}>Try again</button>
    {/if}
  </div>
</div>
