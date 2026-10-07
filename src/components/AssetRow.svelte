<script lang="ts">
  import type { Asset } from '../../shared/types';
  import { direction, formatPct, formatPrice, formatUsdCompact } from '../lib/format';
  import ChangeText from './ChangeText.svelte';
  import Logo from './Logo.svelte';
  import Sparkline from './Sparkline.svelte';

  let { asset: a }: { asset: Asset } = $props();

  const spoken = $derived.by(() => {
    const d = direction(a.change24h);
    const change = d === 'flat' ? 'unchanged' : `${d} ${formatPct(Math.abs(a.change24h ?? 0)).replace('+', '')}`;
    return `${a.name}, ${formatPrice(a.price)}, ${change} in 24 hours`;
  });
</script>

<a
  href="#/asset/{a.id}"
  aria-label={spoken}
  class="row grid min-h-16 items-center gap-3 px-4 py-2.5 hover:bg-surface-2 active:bg-surface-2">
  <Logo src={a.image} symbol={a.symbol} />
  <div class="min-w-0">
    <div class="truncate font-medium">{a.name}</div>
    <div class="truncate text-sm text-muted"><span class="tabular-nums">{a.rank}</span> · {a.symbol}</div>
  </div>
  <Sparkline values={a.sparkline} class="max-[359px]:hidden" />
  <div class="hidden text-right tabular-nums lg:block"><ChangeText value={a.change7d} /></div>
  <div class="hidden text-right tabular-nums lg:block">{formatUsdCompact(a.marketCap)}</div>
  <div class="hidden text-right tabular-nums lg:block">{formatUsdCompact(a.volume24h)}</div>
  <div class="min-w-[5.5rem] text-right">
    <div class="text-[17px] font-semibold tabular-nums">{formatPrice(a.price)}</div>
    <ChangeText value={a.change24h} class="text-sm" />
  </div>
</a>

<style>
  .row {
    grid-template-columns: auto minmax(0, 1fr) auto auto;
  }
  @media (min-width: 1024px) {
    .row {
      grid-template-columns: auto minmax(0, 1fr) 64px 5.5rem 6.5rem 6.5rem 7.5rem;
    }
  }
</style>
