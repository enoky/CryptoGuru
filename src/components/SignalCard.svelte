<script lang="ts">
  import { INDICATORS, THRESHOLDS, topReasons, type CoinSignal } from '../../shared/signals';
  import { explain, formatScore } from '../lib/explain';
  import { formatTime, sourceLabel } from '../lib/format';
  import { volatilityLabel } from '../../shared/series';
  import BottomSheet from './BottomSheet.svelte';
  import ScoreBar from './ScoreBar.svelte';
  import SigIcon from './SigIcon.svelte';

  let { signal, name }: { signal: CoinSignal; name: string } = $props();
  let open = $state(false);

  const reasons = $derived(topReasons(signal, 2));
  const fallbackReasons = $derived(reasons.length ? reasons : (['trend', 'rsi'] as const));
  const highVol = $derived(signal.metrics.volatility != null && signal.metrics.volatility > THRESHOLDS.highVolatility);
  const toneText = $derived(signal.tone === 'bullish' ? 'text-up' : signal.tone === 'bearish' ? 'text-down' : 'text-fg');
</script>

<section class="rounded-2xl border border-line bg-surface p-4" aria-labelledby="signal-heading">
  <h2 id="signal-heading" class="text-sm font-medium text-muted">Signals</h2>
  <p class="mt-1 text-xl font-semibold {toneText}">
    <span aria-hidden="true">{signal.tone === 'bullish' ? '▲' : signal.tone === 'bearish' ? '▼' : '–'}</span>
    {signal.label}
  </p>
  <p class="text-sm text-muted">{signal.confidence} confidence · score {formatScore(signal.score)}</p>
  <ScoreBar score={signal.score} tone={signal.tone} class="mt-3" />

  <ul class="mt-3 space-y-2">
    {#each fallbackReasons as key}
      <li class="flex gap-2.5">
        <SigIcon sig={signal.signals[key]} />
        <span class="text-[15px]">{explain(key, signal.metrics, signal.signals[key])}</span>
      </li>
    {/each}
    {#if highVol}
      <li class="flex gap-2.5">
        <span class="grid size-6 shrink-0 place-items-center text-warn" aria-hidden="true">!</span>
        <span class="text-[15px]">Volatility is high ({signal.metrics.volatility!.toFixed(0)}% a year), so these signals can change quickly.</span>
      </li>
    {/if}
  </ul>

  <button type="button" class="mt-3 min-h-11 w-full rounded-xl border border-line font-medium hover:bg-surface-2" onclick={() => (open = true)}>
    See all reasons
  </button>
  <p class="mt-2 text-xs text-muted">These signals describe past price behaviour. They are not predictions or financial advice.</p>
</section>

<BottomSheet bind:open title="Why this rating?">
  <p class="font-semibold {toneText}">{signal.label} · {signal.confidence} confidence</p>
  <p class="text-sm text-muted">{name} · score {formatScore(signal.score)} out of ±100</p>
  <ul class="mt-4 space-y-4">
    {#each INDICATORS as ind}
      {@const sig = signal.signals[ind.key]}
      <li class="flex gap-3">
        <SigIcon {sig} />
        <div class="min-w-0">
          <div class="font-medium">{ind.name} <span class="text-sm font-normal text-muted">· weight {ind.weight}%</span></div>
          <p class="text-[15px] {sig == null ? 'text-muted' : ''}">{explain(ind.key, signal.metrics, sig)}</p>
        </div>
      </li>
    {/each}
  </ul>
  {#if signal.metrics.volatility != null}
    <p class="mt-4 rounded-xl bg-surface-2 p-3 text-[15px]">
      Volatility: {signal.metrics.volatility.toFixed(0)}% a year ({volatilityLabel(signal.metrics.volatility).toLowerCase()}).
      {highVol ? 'That’s high, so confidence is lowered a level and these signals can change quickly.' : ''}
    </p>
  {/if}
  <h3 class="mt-5 font-semibold">How the score works</h3>
  <p class="mt-1 text-[15px] text-muted">
    Each indicator counts +1 (bullish), −1 (bearish) or 0, times its weight. The total is scaled to −100…+100 over the indicators
    that had enough data. +15 or more leans bullish, +50 or more is strong; the same below zero for bearish. Confidence is how many
    of the indicators agree.
  </p>
  <p class="mt-3 text-sm text-muted">
    Based on {signal.metrics.days} days of {sourceLabel(signal.source)} prices, calculated at {formatTime(signal.asOf)}.
  </p>
  <p class="mt-3 text-sm text-muted">
    Signals describe past price behaviour. They are not predictions or financial advice. <a href="#/about" class="underline">More about this</a>
  </p>
</BottomSheet>
