<script lang="ts">
  import { onMount } from 'svelte';
  import BottomNav from './components/BottomNav.svelte';
  import StatusBanner from './components/StatusBanner.svelte';
  import TopBar from './components/TopBar.svelte';
  import { startMarket } from './lib/market.svelte';
  import { router, startRouter } from './lib/router.svelte';
  import { startTheme } from './lib/theme.svelte';
  import About from './routes/About.svelte';
  import Asset from './routes/Asset.svelte';
  import Markets from './routes/Markets.svelte';
  import Signals from './routes/Signals.svelte';
  import Watchlist from './routes/Watchlist.svelte';

  let main: HTMLElement;

  onMount(() => {
    startTheme();
    startRouter();
    void startMarket();
  });
</script>

<button
  type="button"
  class="sr-only z-50 rounded-xl bg-accent px-4 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
  onclick={() => main.focus()}>Skip to content</button>

<div class="lg:flex">
  <BottomNav />
  <div class="min-w-0 flex-1">
    <TopBar />
    <StatusBanner />
    <main bind:this={main} tabindex="-1" class="pb-nav mx-auto max-w-3xl px-4 pt-4 outline-none lg:max-w-5xl lg:px-8 lg:pt-8">
      {#if router.route.name === 'asset'}
        {#key router.route.id}<Asset id={router.route.id} />{/key}
      {:else if router.route.name === 'watchlist'}
        <Watchlist />
      {:else if router.route.name === 'signals'}
        <Signals />
      {:else if router.route.name === 'about'}
        <About />
      {:else}
        <Markets />
      {/if}
    </main>
  </div>
</div>
