<script lang="ts">
  import { formatTime, formatUsdCompact } from '../lib/format';
  import { GLOSSARY } from '../lib/glossary';
  import { market } from '../lib/market.svelte';
  import BottomSheet from './BottomSheet.svelte';
  import ChangeText from './ChangeText.svelte';
  import Sparkline from './Sparkline.svelte';

  let open = $state(false);
  const g = $derived(market.snapshot?.global ?? null);
  const fg = $derived(market.snapshot?.fearGreed ?? null);
</script>

{#if g || fg}
  <button
    type="button"
    class="grid w-full grid-cols-3 gap-2 rounded-2xl border border-line bg-surface p-3 text-left hover:bg-surface-2"
    onclick={() => (open = true)}
    aria-label="Market overview. Tap for details">
    <div class="min-w-0">
      <div class="truncate text-xs text-muted">Market cap</div>
      <div class="font-semibold tabular-nums">{formatUsdCompact(g?.data.totalMarketCap)}</div>
      <ChangeText value={g?.data.marketCapChange24h} class="text-xs" />
    </div>
    <div class="min-w-0">
      <div class="truncate text-xs text-muted"><span aria-hidden="true">BTC dom.</span><span class="sr-only">Bitcoin dominance</span></div>
      <div class="font-semibold tabular-nums">{g?.data.btcDominance != null ? `${g.data.btcDominance.toFixed(1)}%` : '—'}</div>
    </div>
    <div class="min-w-0">
      <div class="truncate text-xs text-muted">Fear &amp; Greed</div>
      {#if fg}
        <div class="font-semibold tabular-nums">{fg.data.value}</div>
        <div class="truncate text-xs text-muted">{fg.data.label}</div>
      {:else}
        <div class="font-semibold">—</div>
      {/if}
    </div>
  </button>
{/if}

<BottomSheet bind:open title="Market overview">
  <div class="space-y-5">
    {#if g}
      <section>
        <h3 class="font-semibold">{GLOSSARY.totalCap.title}: {formatUsdCompact(g.data.totalMarketCap)}</h3>
        <p class="mt-1"><ChangeText value={g.data.marketCapChange24h} /> in 24 hours</p>
        <p class="mt-1 text-muted">{GLOSSARY.totalCap.text}</p>
      </section>
      <section>
        <h3 class="font-semibold">
          {GLOSSARY.dominance.title}: {g.data.btcDominance != null ? `${g.data.btcDominance.toFixed(1)}%` : '—'}
        </h3>
        <p class="mt-1 text-muted">{GLOSSARY.dominance.text}</p>
      </section>
    {/if}
    {#if fg}
      <section>
        <h3 class="font-semibold">{GLOSSARY.fearGreed.title}: {fg.data.value} ({fg.data.label})</h3>
        <div class="mt-2 text-accent">
          <Sparkline values={fg.data.history.map((h) => h.value)} width={300} height={56} class="w-full" />
          <div class="text-xs text-muted">Last {fg.data.history.length} days</div>
        </div>
        <p class="mt-2 text-muted">{GLOSSARY.fearGreed.text}</p>
        <p class="mt-1 text-sm text-muted">
          Source: <a class="underline" href="https://alternative.me/crypto/fear-and-greed-index/" target="_blank" rel="noopener noreferrer"
            >Alternative.me</a> · as of {formatTime(fg.asOf)}
        </p>
      </section>
    {/if}
  </div>
</BottomSheet>
