/** Plain technical-indicator maths on arrays of closes, oldest first. */

/** Simple moving average of the last `n` values, or null if there aren't enough. */
export function sma(values: number[], n: number): number | null {
  if (values.length < n) return null;
  let sum = 0;
  for (let i = values.length - n; i < values.length; i++) sum += values[i];
  return sum / n;
}

/**
 * Exponential moving average series, seeded with the SMA of the first `n`
 * values. Entry i of the result is the EMA ending at values[n - 1 + i].
 */
export function emaSeries(values: number[], n: number): number[] {
  if (values.length < n) return [];
  const k = 2 / (n + 1);
  let ema = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const out = [ema];
  for (let i = n; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

/** Wilder's RSI over `n` periods (default 14), for the latest close. */
export function rsi(closes: number[], n = 14): number | null {
  if (closes.length < n + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= n;
  loss /= n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (loss === 0) return gain === 0 ? 50 : 100;
  return 100 - 100 / (1 + gain / loss);
}

/** MACD(fast, slow, signal) histogram series: (EMA fast − EMA slow) − its EMA. */
export function macdHistogram(closes: number[], fast = 12, slow = 26, signal = 9): number[] {
  const slowEma = emaSeries(closes, slow);
  if (slowEma.length === 0) return [];
  const fastEma = emaSeries(closes, fast).slice(slow - fast);
  const macd = slowEma.map((s, i) => fastEma[i] - s);
  const sig = emaSeries(macd, signal);
  return sig.map((s, i) => macd[i + signal - 1] - s);
}
