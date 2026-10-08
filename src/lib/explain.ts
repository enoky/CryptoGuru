import { dirOf, THRESHOLDS, volScale, type Adjustment, type CoinSignal, type GroupKey, type Metrics, type TrendPartKey } from '../../shared/signals';
import { formatPrice } from './format';

const pct = (n: number, digits = 0) => `${Math.abs(n).toFixed(digits)}%`;
const signed = (n: number, digits = 0) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}%`;

/** A −1…+1 reading as shown next to each check, e.g. "+0.6". */
export const formatReading = (v: number) => (v > 0 ? `+${v.toFixed(1)}` : v < 0 ? `−${Math.abs(v).toFixed(1)}` : '0');

/** "clearly" for a full-strength reading, "slightly" for a weak one. */
const howMuch = (v: number) => (Math.abs(v) >= 0.75 ? 'clearly ' : Math.abs(v) < THRESHOLDS.clear ? 'slightly ' : '');

/** A note for coins whose thresholds were widened because they swing a lot. */
function widened(m: Metrics): string {
  const s = volScale(m.volatility);
  return s > 1.05 ? ` (Thresholds are ${s.toFixed(1)}× wider for this coin because its price swings a lot.)` : '';
}

/** One plain-English sentence per trend check. Describes the past; never says buy or sell. */
export function explainPart(key: TrendPartKey, m: Metrics, v: number | null): string {
  const T = THRESHOLDS;
  const s = volScale(m.volatility);
  switch (key) {
    case 'sma200': {
      if (v == null || m.sma200 == null) return `Needs 200 days of price history; this coin has ${m.days}.`;
      const d = ((m.close - m.sma200) / m.sma200) * 100;
      if (v === 0) return `Price is within ${pct(T.trendBand * s)} of its 200-day average (${formatPrice(m.sma200)}), so there’s no clear long-term trend.`;
      return `Price (${formatPrice(m.close)}) is ${pct(d)} ${d > 0 ? 'above' : 'below'} its 200-day average (${formatPrice(m.sma200)}). The long-term trend is ${d > 0 ? 'up' : 'down'}.${widened(m)}`;
    }
    case 'cross': {
      if (v == null || m.sma50 == null || m.sma200 == null) return `Needs 200 days of price history; this coin has ${m.days}.`;
      if (v > 0) return `The 50-day average (${formatPrice(m.sma50)}) is above the 200-day average (${formatPrice(m.sma200)}), a pattern often called a “golden cross”.`;
      if (v < 0) return `The 50-day average (${formatPrice(m.sma50)}) is below the 200-day average (${formatPrice(m.sma200)}), a pattern often called a “death cross”.`;
      return `The 50-day and 200-day averages are within ${pct(T.crossBand * s, 1)} of each other, so neither is clearly leading.`;
    }
    case 'macd':
      if (v == null) return 'Needs about 40 days of price history.';
      if (v > 0) return `MACD momentum is positive and has risen for ${T.macdDays} days in a row.`;
      if (v < 0) return `MACD momentum is negative and has fallen for ${T.macdDays} days in a row.`;
      return `MACD momentum hasn’t moved steadily in one direction over the last ${T.macdDays} days.`;
  }
}

/** One plain-English sentence per scored group. */
export function explainGroup(key: GroupKey, s: Pick<CoinSignal, 'metrics' | 'signals' | 'trendParts'>): string {
  const T = THRESHOLDS;
  const m = s.metrics;
  const v = s.signals[key];
  switch (key) {
    case 'trend': {
      if (v == null) return 'Needs about 40 days of price history.';
      const parts = Object.values(s.trendParts).filter((x): x is number => x != null);
      const up = parts.filter((x) => x > 0).length;
      const down = parts.filter((x) => x < 0).length;
      const of = `${parts.length === 3 ? 'three' : parts.length === 2 ? 'two' : 'one'}`;
      const d = dirOf(v);
      if (d === 1) return `The trend is ${howMuch(v)}up: ${up} of ${of} trend checks point up${down ? `, ${down} down` : ''}.`;
      if (d === -1) return `The trend is ${howMuch(v)}down: ${down} of ${of} trend checks point down${up ? `, ${up} up` : ''}.`;
      if (up && down) return `The trend checks are mixed: ${up} up, ${down} down, so there’s no clear trend.`;
      if (up) return `The trend leans up only slightly: ${up} of ${of} trend checks point up, but not strongly enough to count.`;
      if (down) return `The trend leans down only slightly: ${down} of ${of} trend checks point down, but not strongly enough to count.`;
      return `None of the ${of} trend checks shows a clear direction.`;
    }
    case 'strength': {
      if (m.return90d == null) return `Needs ${T.strengthDays} days of price history.`;
      if (v == null || m.btcReturn90d == null) {
        return 'Bitcoin is the yardstick for this check, so it doesn’t apply to Bitcoin itself, or Bitcoin’s own figures weren’t ready yet.';
      }
      const gap = `${Math.abs(m.return90d - m.btcReturn90d).toFixed(0)} percentage points`;
      const both = `Over ${T.strengthDays} days this coin moved ${signed(m.return90d)} and Bitcoin ${signed(m.btcReturn90d)}`;
      if (v > 0) return `${both}: it has ${howMuch(v)}outperformed Bitcoin by ${gap}. Coins that lead the market have often kept leading for a while.${widened(m)}`;
      if (v < 0) return `${both}: it has ${howMuch(v)}lagged Bitcoin by ${gap}. Coins that lag the market have often kept lagging for a while.${widened(m)}`;
      return `${both}: about the same, so neither leading nor lagging.`;
    }
    case 'rsi': {
      if (v == null || m.rsi == null) return 'Needs 15 days of price history.';
      const r = Math.round(m.rsi);
      const longTrend = Math.sign(s.trendParts.sma200 ?? 0);
      if (m.rsi < T.rsiOversold) {
        if (v > 0) {
          return longTrend > 0
            ? `RSI is ${r}: oversold while the long-term trend is up. Sharp dips in an uptrend have often bounced.`
            : `RSI is ${r}: below ${T.rsiOversold}, usually read as oversold. With no clear long-term trend, prices that fell this fast have often bounced.`;
        }
        return `RSI is ${r}: oversold, but in a long-term downtrend, where prices that fall fast often keep falling. Not counted either way.`;
      }
      if (m.rsi > T.rsiOverbought) {
        if (v < 0) {
          return longTrend < 0
            ? `RSI is ${r}: overbought while the long-term trend is down. Sharp rallies in a downtrend have often faded.`
            : `RSI is ${r}: above ${T.rsiOverbought}, usually read as overbought. With no clear long-term trend, prices that rose this fast have often cooled off.`;
        }
        return `RSI is ${r}: overbought, but in a long-term uptrend, where strong momentum often continues. Not counted either way.`;
      }
      return `RSI is ${r}: neither overbought nor oversold.`;
    }
    case 'volume': {
      if (v == null || m.volumeRatio == null) return 'Needs 30 days of trading-volume data.';
      const x = `${m.volumeRatio.toFixed(1)}×`;
      const move = m.return7d ?? 0;
      if (v > 0) return `Trading over the last 7 days is ${x} the 30-day average while the price rose ${pct(move, 1)}: heavy buying backs the move up.`;
      if (v < 0) return `Trading over the last 7 days is ${x} the 30-day average while the price fell ${pct(move, 1)}: heavy selling backs the move down.`;
      return `Trading volume is normal: ${x} its 30-day average.`;
    }
  }
}

/** Market context: shown, never scored. */
export function explainContext(m: Metrics): { key: string; title: string; text: string }[] {
  const T = THRESHOLDS;
  const out: { key: string; title: string; text: string }[] = [];
  if (m.fearGreed != null) {
    const v = m.fearGreed;
    const mood = v <= T.extremeFear ? 'extreme fear' : v >= T.extremeGreed ? 'extreme greed' : v < 50 ? 'fear' : v > 50 ? 'greed' : 'neutral';
    out.push({ key: 'mood', title: 'Market mood', text: `The Fear & Greed Index is ${v} (${mood}). It’s the same for every coin, so it doesn’t change the score.` });
  }
  if (m.breadth != null) {
    const b = m.breadth;
    const reading = b < T.weakBreadth ? 'most of the market is in a downtrend' : b > T.strongBreadth ? 'most of the market is in an uptrend' : 'the market is split';
    out.push({ key: 'breadth', title: 'Market breadth', text: `${b}% of rated coins are above their 200-day average: ${reading}.` });
  }
  if (m.athChangePct != null) {
    const d = m.athChangePct;
    out.push({
      key: 'ath',
      title: 'All-time high',
      text:
        d > -5
          ? 'The price is at or near its all-time high.'
          : d < -80
            ? `The price is ${pct(d)} below its all-time high. Coins this far down have often taken years to recover, if they did.`
            : `The price is ${pct(d)} below its all-time high.`,
    });
  }
  if (m.turnover != null) {
    out.push({
      key: 'liquidity',
      title: 'Liquidity',
      text:
        m.turnover < T.thinTurnover
          ? `Only ${m.turnover.toFixed(1)}% of its market value traded in the last 24 hours: thinly traded, so its price signals are less reliable.`
          : `${m.turnover.toFixed(1)}% of its market value traded in the last 24 hours.`,
    });
  }
  return out;
}

/** Why confidence was lowered, one sentence each. */
export function explainAdjustment(a: Adjustment, m: Metrics): string {
  const T = THRESHOLDS;
  switch (a) {
    case 'volatile':
      return `Volatility is high (${(m.volatility ?? 0).toFixed(0)}% a year), so these signals can change quickly.`;
    case 'fewChecks':
      return 'Only two of the four checks had enough data.';
    case 'thin':
      return `Thinly traded (24h volume under ${T.thinTurnover}% of market value), so prices are easier to push around.`;
    case 'greed':
      return `The market is in extreme greed (Fear & Greed ${m.fearGreed}): when the crowd is already this optimistic, bullish signals have often disappointed.`;
    case 'fear':
      return `The market is in extreme fear (Fear & Greed ${m.fearGreed}): when the crowd is already this gloomy, bearish signals have often disappointed.`;
    case 'weakMarket':
      return `Only ${m.breadth}% of coins are above their 200-day average: a bullish reading is going against most of the market.`;
    case 'strongMarket':
      return `${m.breadth}% of coins are above their 200-day average: a bearish reading is going against most of the market.`;
  }
}

export const SHORT_LABEL = {
  'Strong bullish signals': 'Strong bullish',
  'Leaning bullish': 'Leaning bullish',
  'Mixed / neutral': 'Mixed',
  'Leaning bearish': 'Leaning bearish',
  'Strong bearish signals': 'Strong bearish',
} as const;

export const formatScore = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
