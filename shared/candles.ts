import { CircuitBreaker, firstSuccessful, type Attempt } from './failover';
import type { FetchFn } from './http';
import * as binance from './sources/binance';
import * as coingecko from './sources/coingecko';
import * as kraken from './sources/kraken';
import { cleanCandles } from './series';
import type { Candle, CandleSet, Range, SourceName } from './types';

/** How long candles stay fresh, per range. */
export const CANDLE_TTL_MS: Record<Range, number> = {
  '7d': 15 * 60_000,
  '30d': 30 * 60_000,
  '1y': 60 * 60_000,
};

export interface CandleRequest {
  id: string;
  /** Upper-case ticker from the snapshot; without it only CoinGecko is tried. */
  symbol?: string;
  /** Latest snapshot price, used to reject candles for the wrong coin. */
  refPrice?: number;
  range: Range;
}

/** Exchange data is matched by ticker, so check it really is the same coin. */
function checked(candles: Candle[], refPrice: number | undefined, source: string): Candle[] {
  const clean = cleanCandles(candles);
  if (clean.length < 10) throw new Error(`${source}: too few candles`);
  const last = clean[clean.length - 1].c;
  if (refPrice && Math.abs(last - refPrice) / refPrice > 0.1) {
    throw new Error(`${source}: price ${last} doesn't match ${refPrice}, probably a different coin`);
  }
  return clean;
}

export async function fetchCandleSet(
  req: CandleRequest,
  fetchFn: FetchFn,
  breaker: CircuitBreaker,
  o: { now: number; coingeckoKey?: string; baseDelayMs?: number },
): Promise<CandleSet> {
  const net = { baseDelayMs: o.baseDelayMs };
  const { id, symbol, refPrice, range } = req;
  const attempts: Attempt<Candle[], SourceName>[] = [];
  if (symbol && binance.hasUsdtPair(symbol)) {
    attempts.push({ name: 'binance', run: async () => checked(await binance.fetchCandles(fetchFn, symbol, range, net), refPrice, 'Binance') });
  }
  attempts.push({
    name: 'coingecko',
    run: async () => checked(await coingecko.fetchCandles(fetchFn, id, range, { apiKey: o.coingeckoKey, ...net }), undefined, 'CoinGecko'),
  });
  if (symbol && binance.hasUsdtPair(symbol)) {
    attempts.push({ name: 'kraken', run: async () => checked(await kraken.fetchCandles(fetchFn, symbol, range, net), refPrice, 'Kraken') });
  }
  const { value, source } = await firstSuccessful(attempts, breaker);
  return { id, range, candles: value, asOf: o.now, source };
}
