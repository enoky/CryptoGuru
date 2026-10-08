import { CircuitBreaker, firstSuccessful, NotAvailable, type Attempt } from './failover';
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
  /** For the 1y range: fetch only this many daily candles (the signal job needs ~250). */
  days?: number;
}

/** Exchange data is matched by ticker, so check it really is the same coin. */
function checked(candles: Candle[], refPrice: number | undefined, source: string): Candle[] {
  const clean = cleanCandles(candles);
  if (clean.length < 10) throw new NotAvailable(`${source}: too few candles`);
  const last = clean[clean.length - 1].c;
  if (refPrice && Math.abs(last - refPrice) / refPrice > 0.1) {
    throw new NotAvailable(`${source}: price ${last} doesn't match ${refPrice}, probably a different coin`);
  }
  return clean;
}

export interface CandleSetOptions {
  now: number;
  coingeckoKey?: string;
  baseDelayMs?: number;
  retries?: number;
  /**
   * 'chart' (default): Binance, CoinGecko, Kraken — CoinGecko has better
   * coverage. 'exchanges-first': Binance, Kraken, then CoinGecko only if
   * `allowCoinGecko`, to save the monthly CoinGecko budget for batch jobs.
   */
  order?: 'chart' | 'exchanges-first';
  allowCoinGecko?: boolean;
}

export async function fetchCandleSet(req: CandleRequest, fetchFn: FetchFn, breaker: CircuitBreaker, o: CandleSetOptions): Promise<CandleSet> {
  const { id, symbol, refPrice, range, days } = req;
  const net = { baseDelayMs: o.baseDelayMs, retries: o.retries, days };
  const onExchanges = !!symbol && binance.hasUsdtPair(symbol);
  const fromBinance: Attempt<Candle[], SourceName> = {
    name: 'binance',
    run: async () => checked(await binance.fetchCandles(fetchFn, symbol!, range, net), refPrice, 'Binance'),
  };
  const fromKraken: Attempt<Candle[], SourceName> = {
    name: 'kraken',
    run: async () => checked(await kraken.fetchCandles(fetchFn, symbol!, range, net), refPrice, 'Kraken'),
  };
  const fromCoinGecko: Attempt<Candle[], SourceName> = {
    name: 'coingecko',
    run: async () => checked(await coingecko.fetchCandles(fetchFn, id, range, { apiKey: o.coingeckoKey, ...net }), undefined, 'CoinGecko'),
  };

  const attempts: Attempt<Candle[], SourceName>[] =
    o.order === 'exchanges-first'
      ? [...(onExchanges ? [fromBinance, fromKraken] : []), ...(o.allowCoinGecko ? [fromCoinGecko] : [])]
      : [...(onExchanges ? [fromBinance] : []), fromCoinGecko, ...(onExchanges ? [fromKraken] : [])];
  if (attempts.length === 0) throw new Error(`No candle source allowed for ${id}`);
  const { value, source } = await firstSuccessful(attempts, breaker);
  return { id, range, candles: value, asOf: o.now, source };
}
