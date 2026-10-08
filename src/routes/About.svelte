<script lang="ts">
  import Attribution from '../components/Attribution.svelte';
  import { install, pwa } from '../lib/pwa.svelte';

  const isIos = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);

  const SECTIONS = [
    {
      title: 'What is CryptoGuru?',
      body: [
        'A free, simple way to follow the most popular crypto assets on your phone: live prices, charts and the key numbers, explained in plain English.',
        'There is no sign-up and nothing to download from an app store.',
      ],
    },
    {
      title: 'Where does the data come from?',
      body: [
        'Rankings, market caps and supply come from CoinGecko, with CoinPaprika as a backup. Live prices and charts come from Binance’s public market data, with CoinGecko and Kraken as backups. The Fear & Greed Index comes from Alternative.me.',
        'Market data refreshes about every 10 minutes and live prices every minute. Every screen shows when its data is from. If a source is down, the app switches to a backup or shows the last data it had, clearly marked.',
      ],
    },
    {
      title: 'How do signals work?',
      body: [
        'Each coin gets six simple checks on its daily prices: its long-term trend (price against the 200-day average), the 50-day against the 200-day average, momentum (MACD), RSI, trading volume, and the market-wide Fear & Greed Index. Each check is bullish, bearish or neutral, and they combine into a score from −100 to +100.',
        'Every rating lists every check behind it in plain English, so you can see exactly why. The checks only look at past prices and volume: they ignore news, fundamentals and regulation, they lag behind the price, and they often fail in sideways markets. They are not predictions.',
      ],
    },
    {
      title: 'Privacy',
      body: [
        'No accounts, no cookies, no tracking and no ads. Your watchlist and settings are stored only on this device.',
        ...(import.meta.env.VITE_CF_ANALYTICS_TOKEN
          ? [
              'Page visits are counted with Cloudflare Web Analytics, which uses no cookies and collects no personal data: only totals such as how many people opened each page.',
            ]
          : []),
      ],
    },
    {
      title: 'Disclaimer',
      body: [
        'CryptoGuru provides general market information for educational purposes only. It is not financial, investment, legal or tax advice, and it is not a recommendation to buy, sell or hold any asset.',
        'Crypto assets are highly volatile and you can lose all of your money. Data may be delayed or inaccurate. Do your own research and consider consulting a licensed professional.',
      ],
    },
  ];
</script>

<h1 class="text-xl font-bold">About</h1>

{#if !pwa.installed}
  <section class="mt-4 rounded-2xl border border-line bg-surface p-4" aria-labelledby="install-heading">
    <h2 id="install-heading" class="font-semibold">Add CryptoGuru to your home screen</h2>
    <p class="mt-1 text-[15px] text-muted">It opens full-screen like an app, and works without a connection using the last data it saved.</p>
    {#if pwa.canInstall}
      <button type="button" class="mt-3 min-h-12 w-full rounded-xl bg-accent font-semibold text-accent-fg" onclick={install}>Install app</button>
    {:else if isIos}
      <p class="mt-2 text-[15px]">In Safari, tap the Share button <span aria-hidden="true">(□↑)</span>, then <strong>Add to Home Screen</strong>.</p>
    {:else}
      <p class="mt-2 text-[15px]">Open your browser’s menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>
    {/if}
  </section>
{/if}
<div class="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
  {#each SECTIONS as s, i}
    <details open={i === 0} class="group">
      <summary class="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 font-semibold">
        {s.title}<span aria-hidden="true" class="text-muted transition-transform group-open:rotate-90">›</span>
      </summary>
      <div class="space-y-2 px-4 pb-4">
        {#each s.body as p}<p>{p}</p>{/each}
      </div>
    </details>
  {/each}
</div>
<Attribution />
