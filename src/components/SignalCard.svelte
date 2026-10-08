<script lang="ts">
  import { dirOf, GROUPS, TREND_PARTS, topReasons, type CoinSignal } from '../../shared/signals';
  import { explainCaution, explainContext, explainGroup, explainPart, formatReading, formatScore } from '../lib/explain';
  import { formatTime, sourceLabel } from '../lib/format';
  import { volatilityLabel } from '../../shared/series';
  import BottomSheet from './BottomSheet.svelte';
  import ScoreBar from './ScoreBar.svelte';
  import SigIcon from './SigIcon.svelte';

  let { signal, name }: { signal: CoinSignal; name: string } = $props();
  let open = $state(false);

  const reasons = $derived(topReasons(signal, 2));
  const fallbackReasons = $derived(reasons.length ? reasons : (['trend', 'rsi'] as const));
  const context = $derived(explainContext(signal.metrics));
  const toneText = $derived(signal.tone === 'up' ? 'text-up' : signal.tone === 'down' ? 'text-down' : 'text-fg');
</script>

<section class="rounded-2xl border border-line bg-surface p-4" aria-labelledby="signal-heading">
  <h2 id="signal-heading" class="text-sm font-medium text-muted">Signals</h2>
  <p class="mt-1 text-xl font-semibold {toneText}">
    <span aria-hidden="true">{signal.tone === 'up' ? '▲' : signal.tone === 'down' ? '▼' : '–'}</span>
    {signal.label}
  </p>
  <p class="text-sm text-muted">{signal.agreement} agreement · score {formatScore(signal.score)}</p>
  <ScoreBar score={signal.score} tone={signal.tone} class="mt-3" />

  <ul class="mt-3 space-y-2">
    {#each fallbackReasons as key}
      <li class="flex gap-2.5">
        <SigIcon sig={dirOf(signal.signals[key])} />
        <span class="text-[15px]">{explainGroup(key, signal)}</span>
      </li>
    {/each}
    {#each signal.cautions.slice(0, 1) as a}
      <li class="flex gap-2.5">
        <span class="grid size-6 shrink-0 place-items-center text-warn" aria-hidden="true">!</span>
        <span class="text-[15px]">{explainCaution(a, signal.metrics)}</span>
      </li>
    {/each}
  </ul>

  <button type="button" class="mt-3 min-h-11 w-full rounded-xl border border-line font-medium hover:bg-surface-2" onclick={() => (open = true)}>
    See all reasons
  </button>
  <p class="mt-2 text-xs text-muted">These signals describe past price behaviour. They are not predictions or financial advice.</p>
</section>

<BottomSheet bind:open title="Why this rating?">
  <p class="font-semibold {toneText}">{signal.label} · {signal.agreement} agreement</p>
  <p class="text-sm text-muted">{name} · score {formatScore(signal.score)} out of ±100</p>
  <ul class="mt-4 space-y-4">
    {#each GROUPS as g}
      {@const v = signal.signals[g.key]}
      <li class="flex gap-3">
        <SigIcon sig={dirOf(v)} />
        <div class="min-w-0">
          <div class="font-medium">
            {g.name}
            <span class="text-sm font-normal text-muted">· weight {g.weight}%{v != null ? ` · reading ${formatReading(v)}` : ''}</span>
          </div>
          <p class="text-[15px] {v == null ? 'text-muted' : ''}">{explainGroup(g.key, signal)}</p>
          {#if g.key === 'trend'}
            <ul class="mt-2 space-y-2 border-l-2 border-line pl-3">
              {#each TREND_PARTS as p}
                {@const pv = signal.trendParts[p.key]}
                <li>
                  <div class="text-sm font-medium">{p.name}{pv != null ? ` · ${formatReading(pv)}` : ''}</div>
                  <p class="text-sm {pv == null ? 'text-muted' : ''}">{explainPart(p.key, signal.metrics, pv)}</p>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </li>
    {/each}
  </ul>

  {#if signal.cautions.length}
    <h3 class="mt-5 font-semibold">Reasons for caution</h3>
    <ul class="mt-2 space-y-2">
      {#each signal.cautions as a}
        <li class="flex gap-2.5">
          <span class="grid size-6 shrink-0 place-items-center text-warn" aria-hidden="true">!</span>
          <span class="text-[15px]">{explainCaution(a, signal.metrics)}</span>
        </li>
      {/each}
    </ul>
  {/if}

  <h3 class="mt-5 font-semibold">Market context <span class="text-sm font-normal text-muted">· not scored</span></h3>
  <ul class="mt-2 space-y-2 text-[15px]">
    {#if signal.metrics.volatility != null}
      <li>
        <span class="font-medium">Volatility:</span>
        {signal.metrics.volatility.toFixed(0)}% a year ({volatilityLabel(signal.metrics.volatility).toLowerCase()}).
      </li>
    {/if}
    {#each context as c (c.key)}
      <li><span class="font-medium">{c.title}:</span> {c.text}</li>
    {/each}
  </ul>

  <h3 class="mt-5 font-semibold">How the score works</h3>
  <p class="mt-1 text-[15px] text-muted">
    Each check reads from −1 (pointing down) to +1 (pointing up), times its weight; the trend reading is the average of its three parts.
    The total is scaled to −100…+100 over the checks that had enough data. +15 or more is an uptrend, +50 or more a strong one; the
    same below zero for a downtrend. Agreement is how many of the checks point the same way; it isn’t a measure of how likely the rating is to be right.
    Market context never changes the score.
  </p>
  <p class="mt-3 text-sm text-muted">
    Based on {signal.metrics.days} days of {sourceLabel(signal.source)} prices, calculated at {formatTime(signal.asOf)}.
  </p>
  <p class="mt-3 text-sm text-muted">
    Signals describe past price behaviour. They are not predictions or financial advice.
    <a href="#/signals/backtest" class="underline">See how often they were right in the past</a>
  </p>
</BottomSheet>
