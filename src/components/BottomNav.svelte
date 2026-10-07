<script lang="ts">
  import { router } from '../lib/router.svelte';
  import { cycleTheme, theme } from '../lib/theme.svelte';
  import CurrencyPicker from './CurrencyPicker.svelte';
  import Icon, { type IconName } from './Icon.svelte';

  const TABS: { href: string; label: string; icon: IconName; match: string[] }[] = [
    { href: '#/', label: 'Markets', icon: 'markets', match: ['markets', 'asset'] },
    { href: '#/watchlist', label: 'Watchlist', icon: 'star', match: ['watchlist'] },
    { href: '#/signals', label: 'Signals', icon: 'signals', match: ['signals', 'backtest'] },
    { href: '#/about', label: 'About', icon: 'info', match: ['about'] },
  ];
</script>

<nav
  aria-label="Main"
  class="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:shrink-0 lg:flex-col lg:border-t-0 lg:border-r lg:pb-0">
  <a href="#/" class="hidden items-center gap-2 px-6 py-6 text-xl font-bold lg:flex">
    <img src="/icon.svg" alt="" width="32" height="32" class="rounded-lg" />CryptoGuru
  </a>
  <ul class="grid h-[var(--nav-h)] grid-cols-4 lg:flex lg:h-auto lg:flex-col lg:gap-1 lg:px-3">
    {#each TABS as tab}
      {@const active = tab.match.includes(router.route.name)}
      <li>
        <a
          href={tab.href}
          aria-current={active ? 'page' : undefined}
          class="flex h-full min-h-11 flex-col items-center justify-center gap-0.5 text-xs font-medium lg:flex-row lg:justify-start lg:gap-3 lg:rounded-xl lg:px-3 lg:py-2.5 lg:text-base {active
            ? 'text-accent lg:bg-surface-2'
            : 'text-muted hover:text-fg'}">
          <Icon name={tab.icon} filled={active && tab.icon === 'star'} />
          {tab.label}
        </a>
      </li>
    {/each}
  </ul>
  <div class="mt-auto hidden lg:block"><CurrencyPicker variant="sidebar" /></div>
  <button
    type="button"
    class="mx-3 mb-6 hidden min-h-11 items-center gap-3 rounded-xl px-3 text-muted hover:text-fg lg:flex"
    onclick={cycleTheme}>
    <Icon name={theme.choice === 'system' ? 'auto' : theme.choice === 'dark' ? 'moon' : 'sun'} />
    Theme: {theme.choice === 'system' ? 'device' : theme.choice}
  </button>
</nav>
