/** Small statistics helpers shared by the in-app backtest and the research backtest. */

/** Deterministic random numbers (mulberry32), so a result can be reproduced. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const BOOTSTRAP_ROUNDS = 1000;

/**
 * 5th and 95th percentiles of `stat` over block-bootstrap resamples of
 * `blocks` (e.g. whole months), so days that overlap and coins that move
 * together count once, not many times. Null with fewer than 2 blocks.
 */
export function bootstrap<T>(blocks: T[], stat: (sample: T[]) => number | null, rounds = BOOTSTRAP_ROUNDS, seed = 42): [number, number] | null {
  if (blocks.length < 2) return null;
  const rand = rng(seed);
  const vals: number[] = [];
  for (let r = 0; r < rounds; r++) {
    const sample = Array.from({ length: blocks.length }, () => blocks[Math.floor(rand() * blocks.length)]);
    const v = stat(sample);
    if (v != null && Number.isFinite(v)) vals.push(v);
  }
  if (vals.length < rounds / 2) return null;
  vals.sort((a, b) => a - b);
  return [vals[Math.floor(vals.length * 0.05)], vals[Math.floor(vals.length * 0.95)]];
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Calendar month index (year × 12 + month, UTC) of a timestamp in ms. */
export function monthIndex(t: number): number {
  const d = new Date(t);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}
