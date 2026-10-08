<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let { open = $bindable(false), title, children }: { open?: boolean; title: string; children: Snippet } = $props();

  let dialog: HTMLDialogElement;
  let closeButton: HTMLButtonElement;
  /** Whether we added a history entry, so the phone's back button closes the sheet. */
  let pushed = false;
  const titleId = `sheet-${Math.random().toString(36).slice(2, 8)}`;

  $effect(() => {
    if (open && !dialog.open) {
      dialog.showModal();
      // Otherwise the browser focuses the first link, which may be at the bottom and scrolls the sheet.
      closeButton.focus({ preventScroll: true });
      dialog.scrollTop = 0;
      history.pushState({ sheet: titleId }, '');
      pushed = true;
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });

  function onPopState() {
    if (pushed) {
      pushed = false;
      open = false;
    }
  }

  function close() {
    if (pushed) history.back(); // popstate then sets open = false
    else open = false;
  }

  // Swipe down on the handle/header to close.
  let startY: number | null = null;
  let dragY = $state(0);
  const onTouchStart = (e: TouchEvent) => (startY = e.touches[0].clientY);
  const onTouchMove = (e: TouchEvent) => {
    if (startY != null) dragY = Math.max(0, e.touches[0].clientY - startY);
  };
  const onTouchEnd = () => {
    if (dragY > 80) close();
    startY = null;
    dragY = 0;
  };
</script>

<svelte:window onpopstate={onPopState} />

<dialog
  bind:this={dialog}
  aria-labelledby={titleId}
  class="sheet"
  oncancel={(e) => {
    e.preventDefault();
    close();
  }}
  onclick={(e) => {
    if (e.target === dialog) close();
  }}>
  <div class="sheet-panel" style:transform={dragY ? `translateY(${dragY}px)` : undefined}>
    <div class="cursor-grab touch-none" ontouchstart={onTouchStart} ontouchmove={onTouchMove} ontouchend={onTouchEnd} role="presentation">
      <div class="mx-auto mt-2 h-1.5 w-10 rounded-full bg-line lg:hidden"></div>
      <div class="flex items-center justify-between gap-2 py-1 pr-1 pl-5">
        <h2 id={titleId} class="min-w-0 text-lg font-semibold">{title}</h2>
        <button
          bind:this={closeButton}
          type="button"
          class="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2"
          onclick={close}
          aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
    </div>
    <div class="relative max-h-[75dvh] overflow-y-auto px-5 pb-[calc(20px+env(safe-area-inset-bottom))] lg:max-h-none lg:flex-1">
      {@render children()}
    </div>
  </div>
</dialog>

<style>
  .sheet {
    margin: auto 0 0;
    width: 100%;
    max-width: 100%;
    max-height: 100dvh;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    /* Only the content area scrolls; the sheet itself stays pinned to the bottom. */
    overflow: hidden;
  }
  .sheet::backdrop {
    background: rgb(0 0 0 / 0.45);
  }
  .sheet-panel {
    /* Contain absolutely positioned descendants (e.g. screen-reader-only text) so the dialog itself never scrolls. */
    position: relative;
    background: var(--surface);
    border-radius: 20px 20px 0 0;
    box-shadow: 0 -8px 30px rgb(0 0 0 / 0.2);
    animation: slide-up 0.22s ease-out;
    transition: transform 0.1s;
  }
  @media (min-width: 640px) {
    .sheet {
      margin: auto auto 0;
      max-width: 560px;
    }
  }
  /* On desktop, sheets become side panels. */
  @media (min-width: 1024px) {
    .sheet {
      margin: 0 0 0 auto;
      height: 100dvh;
      max-width: 420px;
    }
    .sheet-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      border-radius: 20px 0 0 20px;
      animation-name: slide-left;
    }
  }
  @keyframes slide-up {
    from {
      transform: translateY(100%);
    }
  }
  @keyframes slide-left {
    from {
      transform: translateX(100%);
    }
  }
</style>
