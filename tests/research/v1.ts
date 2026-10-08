import { labelFor, type Metrics, type SignalLabel } from '../../shared/signals';

/**
 * The rules as they were before Phase 4 (six equal-footing checks, Fear &
 * Greed scored), frozen so the backtest can compare old against new.
 * Don't change: it's the yardstick, not live code.
 */
const WEIGHTS = { trend: 25, cross: 15, macd: 20, rsi: 15, volume: 10, mood: 15 } as const;

export function v1Label(m: Metrics): SignalLabel | null {
  const band = (pct: number, limit: number) => (pct > limit ? 1 : pct < -limit ? -1 : 0);
  const pctFrom = (a: number, b: number) => ((a - b) / b) * 100;
  let macd: number | null = null;
  if (m.macdHist) {
    const h = m.macdHist;
    const rising = h.every((x, i) => i === 0 || x > h[i - 1]);
    const falling = h.every((x, i) => i === 0 || x < h[i - 1]);
    const last = h[h.length - 1];
    macd = last > 0 && rising ? 1 : last < 0 && falling ? -1 : 0;
  }
  let volume: number | null = null;
  if (m.volumeRatio != null && m.return7d != null) volume = m.volumeRatio > 1.3 ? Math.sign(m.return7d) : 0;
  const s: Record<keyof typeof WEIGHTS, number | null> = {
    trend: m.sma200 != null ? band(pctFrom(m.close, m.sma200), 2) : null,
    cross: m.sma50 != null && m.sma200 != null ? band(pctFrom(m.sma50, m.sma200), 1) : null,
    macd,
    rsi: m.rsi == null ? null : m.rsi < 30 ? 1 : m.rsi > 70 ? -1 : 0,
    volume,
    mood: m.fearGreed == null ? null : m.fearGreed <= 25 ? 1 : m.fearGreed >= 75 ? -1 : 0,
  };
  const keys = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).filter((k) => s[k] != null);
  if (keys.length < 3) return null;
  const total = keys.reduce((a, k) => a + WEIGHTS[k], 0);
  return labelFor(Math.round((keys.reduce((a, k) => a + WEIGHTS[k] * s[k]!, 0) / total) * 100)).label;
}
