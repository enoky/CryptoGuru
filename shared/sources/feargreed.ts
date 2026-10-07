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
