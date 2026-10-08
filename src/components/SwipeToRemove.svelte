<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * Swipe a row left: a short swipe reveals Remove, a long one removes it.
   * A shortcut only: Edit mode has the same action as a button for everyone.
   */
  let { onremove, children }: { onremove: () => void; children: Snippet } = $props();

  const REVEAL = 88;
  let dx = $state(0);
  let open = $state(false);
  let animating = $state(false);
  let row: HTMLDivElement;
  let start: { x: number; y: number; base: number } | null = null;
  let axis: 'x' | 'y' | null = null;
  let suppressClick = false;

  function onStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    start = { x: e.touches[0].clientX, y: e.touches[0].clientY, base: open ? -REVEAL : 0 };
    axis = null;
    animating = false;
  }

  function onMove(e: TouchEvent) {
    if (!start) return;
    const mx = e.touches[0].clientX - start.x;
    const my = e.touches[0].clientY - start.y;
    axis ??= Math.abs(mx) > 8 || Math.abs(my) > 8 ? (Math.abs(mx) > Math.abs(my) ? 'x' : 'y') : null;
    if (axis !== 'x') return;
    suppressClick = true;
    dx = Math.min(0, start.base + mx);
  }

  function onEnd() {
    if (!start) return;
    start = null;
    if (axis !== 'x') return;
    animating = true;
    const width = row.offsetWidth;
    if (dx < -width * 0.5) {
      dx = -width;
      setTimeout(onremove, 180);
    } else if (dx < -REVEAL / 2) {
      dx = -REVEAL;
      open = true;
    } else {
      dx = 0;
      open = false;
    }
  }
</script>

<div class="relative overflow-hidden" bind:this={row}>
  <button
    type="button"
    tabindex="-1"
    aria-hidden="true"
    class="absolute inset-y-0 right-0 flex items-center bg-[#b91c1c] px-5 font-semibold text-white"
    style="width:{REVEAL}px"
    onclick={onremove}>Remove</button>
  <div
    class="relative touch-pan-y bg-surface {animating ? 'transition-transform duration-200' : ''}"
    style:transform={dx ? `translateX(${dx}px)` : undefined}
    ontouchstart={onStart}
    ontouchmove={onMove}
    ontouchend={onEnd}
    ontouchcancel={onEnd}
    onclickcapture={(e) => {
      // A swipe shouldn't also open the coin; a tap on an open row closes it.
      if (suppressClick || open) {
        e.preventDefault();
        e.stopPropagation();
        if (open && !suppressClick) {
          animating = true;
          dx = 0;
          open = false;
        }
      }
      suppressClick = false;
    }}
    role="presentation">
    {@render children()}
  </div>
</div>
