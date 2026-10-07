<script lang="ts">
  import { cycleTheme, theme } from '../lib/theme.svelte';
  import Icon from './Icon.svelte';

  let hidden = $state(false);
  let lastY = 0;

  function onScroll() {
    const y = scrollY;
    if (y > lastY + 6 && y > 80) hidden = true;
    else if (y < lastY - 6 || y < 80) hidden = false;
    lastY = y;
  }

  const themeLabel = $derived(
    theme.choice === 'system'
      ? `Theme: follows your device. Switch to ${theme.systemDark ? 'light' : 'dark'}`
      : `Theme: ${theme.choice}. Switch back to your device setting`,
  );
</script>

<svelte:window onscroll={onScroll} />

<header
  class="sticky top-0 z-20 border-b border-line bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur transition-transform duration-200 lg:hidden {hidden
    ? '-translate-y-full'
    : ''}">
  <div class="mx-auto flex h-[var(--top-h)] max-w-3xl items-center justify-between px-4">
    <a href="#/" class="flex min-h-11 items-center gap-2 text-lg font-bold">
      <img src="/icon.svg" alt="" width="28" height="28" class="rounded-lg" />CryptoGuru
    </a>
    <button type="button" class="grid size-11 place-items-center rounded-full hover:bg-surface-2" onclick={cycleTheme} aria-label={themeLabel}>
      <Icon name={theme.choice === 'system' ? 'auto' : theme.choice === 'dark' ? 'moon' : 'sun'} />
    </button>
  </div>
</header>
