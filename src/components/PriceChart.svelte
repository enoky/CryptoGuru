<script lang="ts">
  import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
  import { onMount } from 'svelte';
  import type { Candle, Range } from '../../shared/types';
  import { formatDate, formatPrice } from '../lib/format';
  import { isDark } from '../lib/theme.svelte';

  let { candles, range, name }: { candles: Candle[]; range: Range; name: string } = $props();

  let el: HTMLDivElement;
  let chart: IChartApi | undefined = $state();
  let series: ISeriesApi<'Area'> | undefined = $state();

  const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  const first = $derived(candles[0]);
  const last = $derived(candles[candles.length - 1]);
  const high = $derived(candles.reduce((m, c) => (c.h > m.h ? c : m), candles[0]));
  const low = $derived(candles.reduce((m, c) => (c.l < m.l ? c : m), candles[0]));
  const up = $derived(last && first ? last.c >= first.c : true);

  onMount(() => {
    let disposed = false;
    import('lightweight-charts').then(({ createChart, AreaSeries, ColorType, TrackingModeExitMode }) => {
      if (disposed) return;
      chart = createChart(el, {
        autoSize: true,
        layout: { background: { type: ColorType.Solid, color: 'transparent' }, fontFamily: css('--font-sans') || 'system-ui', attributionLogo: false },
        grid: { vertLines: { visible: false } },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
        // No panning or zooming: on a phone, a drag should move the crosshair, and vertical swipes scroll the page.
        handleScroll: false,
        handleScale: false,
        trackingMode: { exitMode: TrackingModeExitMode.OnTouchEnd },
        localization: { priceFormatter: (p: number) => formatPrice(p) },
      });
      series = chart.addSeries(AreaSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
    });
    return () => {
      disposed = true;
      chart?.remove();
    };
  });

  // Colours follow the theme.
  $effect(() => {
    isDark();
    if (!chart || !series) return;
    const color = css(up ? '--up' : '--down');
    chart.applyOptions({
      layout: { textColor: css('--muted') },
      grid: { horzLines: { color: css('--border') } },
      crosshair: { vertLine: { labelBackgroundColor: css('--fg') }, horzLine: { labelBackgroundColor: css('--fg') } },
    });
    series.applyOptions({ lineColor: color, topColor: `${color}55`, bottomColor: `${color}05` });
  });

  $effect(() => {
    if (!chart || !series) return;
    chart.applyOptions({ timeScale: { timeVisible: range !== '1y' } });
    series.setData(candles.map((c) => ({ time: Math.floor(c.t / 1000) as UTCTimestamp, value: c.c })));
    chart.timeScale().fitContent();
  });
</script>

<figure class="m-0">
  <div
    bind:this={el}
    class="h-60 w-full touch-pan-y sm:h-80"
    role="img"
    aria-label="{name} price chart. Started at {formatPrice(first?.c)}, ended at {formatPrice(last?.c)}, high {formatPrice(high?.h)}, low {formatPrice(low?.l)}.">
  </div>
  <table class="sr-only">
    <caption>{name} price summary</caption>
    <tbody>
      {#if first}<tr><th scope="row">Start ({formatDate(first.t)})</th><td>{formatPrice(first.c)}</td></tr>{/if}
      {#if high}<tr><th scope="row">High ({formatDate(high.t)})</th><td>{formatPrice(high.h)}</td></tr>{/if}
      {#if low}<tr><th scope="row">Low ({formatDate(low.t)})</th><td>{formatPrice(low.l)}</td></tr>{/if}
      {#if last}<tr><th scope="row">End ({formatDate(last.t)})</th><td>{formatPrice(last.c)}</td></tr>{/if}
    </tbody>
  </table>
</figure>
