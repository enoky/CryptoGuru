import * as v from 'valibot';

/**
 * Validate each item of an upstream list on its own: bad items are dropped,
 * but if most of the list is bad the API has probably changed shape, so fail.
 */
export function parseItems<S extends v.GenericSchema>(schema: S, input: unknown, what: string): v.InferOutput<S>[] {
  if (!Array.isArray(input)) throw new Error(`${what}: expected a list`);
  const out: v.InferOutput<S>[] = [];
  for (const item of input) {
    const r = v.safeParse(schema, item);
    if (r.success) out.push(r.output);
  }
  if (input.length > 0 && out.length < input.length / 2) {
    throw new Error(`${what}: ${input.length - out.length} of ${input.length} items failed validation`);
  }
  return out;
}

export function parseOne<S extends v.GenericSchema>(schema: S, input: unknown, what: string): v.InferOutput<S> {
  const r = v.safeParse(schema, input);
  if (!r.success) throw new Error(`${what}: unexpected response (${r.issues[0]?.message ?? 'invalid'})`);
  return r.output;
}

export const isPositive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

export const finiteOrNull = (n: number | null | undefined): number | null =>
  typeof n === 'number' && Number.isFinite(n) ? n : null;

/** Only allow https image URLs from upstream data. */
export const safeImage = (url: string | null | undefined): string | null =>
  typeof url === 'string' && url.startsWith('https://') ? url : null;

/** Numbers that arrive as strings (Binance, Kraken, Alternative.me). */
export const numeric = v.pipe(
  v.union([v.string(), v.number()]),
  v.transform((x) => Number(x)),
  v.check((n) => Number.isFinite(n), 'not a number'),
);

/**
 * Fast path for big numeric tables (candles): checked by hand rather than by
 * schema, because the Worker's cron has only 10 ms of CPU per run on the
 * free plan. Rows with non-numbers are dropped; mostly-bad input fails.
 */
export function parseNumericRows(input: unknown, minLength: number, what: string): number[][] {
  if (!Array.isArray(input)) throw new Error(`${what}: expected a list`);
  const out: number[][] = [];
  for (const row of input) {
    if (!Array.isArray(row) || row.length < minLength) continue;
    const nums = new Array<number>(minLength);
    let ok = true;
    for (let i = 0; i < minLength; i++) {
      const v = row[i];
      const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
      if (!Number.isFinite(n)) {
        ok = false;
        break;
      }
      nums[i] = n;
    }
    if (ok) out.push(nums);
  }
  if (input.length > 0 && out.length < input.length / 2) {
    throw new Error(`${what}: ${input.length - out.length} of ${input.length} rows failed validation`);
  }
  return out;
}
