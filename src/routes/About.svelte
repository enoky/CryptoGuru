<script lang="ts">
  import Attribution from '../components/Attribution.svelte';

  const SECTIONS = [
    {
      title: 'What is CryptoGuru?',
      body: [
        'A free, simple way to follow the most popular crypto assets on your phone: live prices, charts and the key numbers, explained in plain English.',
        'There is no sign-up and nothing to install. You can add it to your home screen from your browser’s share or menu button.',
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
      title: 'Privacy',
      body: [
        'No accounts, no cookies, no tracking and no ads. Your watchlist and settings are stored only on this device.',
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
