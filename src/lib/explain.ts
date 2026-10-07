import { THRESHOLDS, type IndicatorKey, type Metrics, type Sig } from '../../shared/signals';
import { formatPrice } from './format';

const pct = (n: number, digits = 0) => `${Math.abs(n).toFixed(digits)}%`;

/** One plain-English sentence per indicator. Describes the past; never says buy or sell. */
export function explain(key: IndicatorKey, m: Metrics, sig: Sig | null): string {
  const T = THRESHOLDS;
  switch (key) {
    case 'trend': {
      if (sig == null || m.sma200 == null) return `Needs 200 days of price history; this coin has ${m.days}.`;
      const d = ((m.close - m.sma200) / m.sma200) * 100;
      if (sig === 1) return `Price (${formatPrice(m.close)}) is ${pct(d)} above its 200-day average (${formatPrice(m.sma200)}). The long-term trend is up.`;
      if (sig === -1) return `Price (${formatPrice(m.close)}) is ${pct(d)} below its 200-day average (${formatPrice(m.sma200)}). The long-term trend is down.`;
      return `Price is within ${T.trendPct}% of its 200-day average (${formatPrice(m.sma200)}), so there’s no clear long-term trend.`;
    }
    case 'cross': {
      if (sig == null || m.sma50 == null || m.sma200 == null) return `Needs 200 days of price history; this coin has ${m.days}.`;
      if (sig === 1) return `The 50-day average (${formatPrice(m.sma50)}) is above the 200-day average (${formatPrice(m.sma200)}), a pattern often called a “golden cross”.`;
      if (sig === -1) return `The 50-day average (${formatPrice(m.sma50)}) is below the 200-day average (${formatPrice(m.sma200)}), a pattern often called a “death cross”.`;
      return `The 50-day and 200-day averages are within ${T.crossPct}% of each other, so neither is clearly leading.`;
    }
    case 'macd':
      if (sig == null) return 'Needs about 40 days of price history.';
      if (sig === 1) return `MACD momentum is positive and has risen for ${T.macdDays} days in a row.`;
      if (sig === -1) return `MACD momentum is negative and has fallen for ${T.macdDays} days in a row.`;
      return `MACD momentum hasn’t moved steadily in one direction over the last ${T.macdDays} days.`;
    case 'rsi': {
      if (sig == null || m.rsi == null) return 'Needs 15 days of price history.';
      const r = Math.round(m.rsi);
      if (sig === 1) return `RSI is ${r}: below ${T.rsiOversold}, which is usually read as oversold. Prices that fell this fast have often bounced.`;
      if (sig === -1) return `RSI is ${r}: above ${T.rsiOverbought}, which is usually read as overbought. Prices that rose this fast have often cooled off.`;
      return `RSI is ${r}: neither overbought nor oversold.`;
    }
    case 'volume': {
      if (sig == null || m.volumeRatio == null) return 'Needs 30 days of trading-volume data.';
      const x = `${m.volumeRatio.toFixed(1)}×`;
      const move = m.return7d ?? 0;
      if (sig === 1) return `Trading over the last 7 days is ${x} the 30-day average while the price rose ${pct(move, 1)}: heavy buying backs the move up.`;
      if (sig === -1) return `Trading over the last 7 days is ${x} the 30-day average while the price fell ${pct(move, 1)}: heavy selling backs the move down.`;
      return `Trading volume is normal: ${x} its 30-day average.`;
    }
    case 'mood': {
      if (sig == null || m.fearGreed == null) return 'The Fear & Greed Index isn’t available right now.';
      const v = m.fearGreed;
      if (sig === 1) return `The market-wide Fear & Greed Index is ${v} (extreme fear). Extreme fear has often come before rebounds, so this counts as a bullish sign.`;
      if (sig === -1) return `The market-wide Fear & Greed Index is ${v} (extreme greed). Extreme greed has often come before pullbacks, so this counts as a bearish sign.`;
      return `The market-wide Fear & Greed Index is ${v}, outside the extremes, so it doesn’t count either way.`;
    }
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
