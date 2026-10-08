import * as v from 'valibot';
import { fetchJson, type FetchFn } from '../http';
import type { FearGreed } from '../types';
import { numeric, parseOne } from '../validate';

export const FEAR_GREED_URL = 'https://api.alternative.me/fng/?limit=30';

const Schema = v.object({
  data: v.pipe(
    v.array(v.object({ value: numeric, value_classification: v.string(), timestamp: numeric })),
    v.minLength(1),
  ),
});

export async function fetchFearGreed(fetchFn: FetchFn, o: { retries?: number; baseDelayMs?: number } = {}): Promise<FearGreed> {
  const { data } = parseOne(Schema, await fetchJson(fetchFn, FEAR_GREED_URL, o), 'Fear & Greed');
  const latest = data[0];
  if (latest.value < 0 || latest.value > 100) throw new Error('Fear & Greed: value out of range');
  return {
    value: latest.value,
    label: latest.value_classification,
    history: data.map((d) => ({ t: d.timestamp * 1000, value: d.value })).reverse(),
  };
}

export const FEAR_GREED_HISTORY_URL = 'https://api.alternative.me/fng/?limit=0';

/**
 * The full daily history (since 2018), oldest first. ~3,000 rows, checked by
 * hand rather than by schema to keep Worker CPU low.
 */
export async function fetchFearGreedHistory(fetchFn: FetchFn, o: { retries?: number; baseDelayMs?: number } = {}): Promise<{ t: number; value: number }[]> {
  const raw = (await fetchJson(fetchFn, FEAR_GREED_HISTORY_URL, o)) as { data?: unknown };
  if (!Array.isArray(raw?.data)) throw new Error('Fear & Greed history: unexpected response');
  const out: { t: number; value: number }[] = [];
  for (const row of raw.data as { value?: unknown; timestamp?: unknown }[]) {
    const value = Number(row?.value);
    const t = Number(row?.timestamp) * 1000;
    if (Number.isFinite(value) && value >= 0 && value <= 100 && Number.isFinite(t) && t > 0) out.push({ t, value });
  }
  if (out.length < raw.data.length / 2 || out.length === 0) throw new Error('Fear & Greed history: too many bad rows');
  return out.sort((a, b) => a.t - b.t);
}
