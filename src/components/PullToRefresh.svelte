<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';

  /** Pull down from the top of the page to refresh. A shortcut: every page also has a visible Refresh button. */
  let { onrefresh }: { onrefresh: () => Promise<unknown> } = $props();

  const TRIGGER = 64;
  const MAX = 100;
  let pull = $state(0);
  let refreshing = $state(false);

  onMount(() => {
    let startY: number | null = null;
    let startX = 0;

    const onStart = (e: TouchEvent) => {
      // Only from the very top, one finger, and not while a sheet is open.
      if (refreshing || window.scrollY > 0 || e.touches.length !== 1 || document.querySelector('dialog[open]')) return;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
    };
    const onMove = (e: TouchEvent) => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      const dx = Math.abs(e.touches[0].clientX - startX);
      // Sideways drags (charts, swipes) and upward scrolls aren't pulls.
      if (dy <= 0 || dx > dy || window.scrollY > 0) {
        pull = 0;
        return;
      }
      pull = Math.min(MAX, dy * 0.5);
    };
    const onEnd = async () => {
      if (startY == null) return;
      startY = null;
      if (pull < TRIGGER) {
        pull = 0;
        return;
      }
      refreshing = true;
      pull = TRIGGER;
      try {
        await onrefresh();
      } finally {
        refreshing = false;
        pull = 0;
      }
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  });
</script>

{#if pull > 0 || refreshing}
  <div
    class="pointer-events-none fixed left-1/2 z-30 grid size-10 -translate-x-1/2 place-items-center rounded-full border border-line bg-surface shadow-md"
    style="top:calc(var(--top-h) + env(safe-area-inset-top) + {pull - 30}px);opacity:{Math.min(1, pull / TRIGGER)}"
    data-testid="pull-indicator"
    data-state={refreshing ? 'refreshing' : pull >= TRIGGER ? 'release' : 'pulling'}
    aria-hidden="true">
    <Icon
      name="refresh"
      size={20}
      class="{pull >= TRIGGER || refreshing ? 'text-accent' : 'text-muted'} {refreshing ? 'animate-spin' : ''}"
      filled={false} />
  </div>
{/if}
{#if refreshing}<span class="sr-only" role="status">Refreshing</span>{/if}
