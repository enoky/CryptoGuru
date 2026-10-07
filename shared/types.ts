export type SourceName = 'coingecko' | 'coinpaprika' | 'binance' | 'kraken' | 'alternative.me';

export interface Asset {
  /** CoinGecko-style id, e.g. "bitcoin". Used in URLs and the watchlist. */
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  rank: number;
  price: number;
  change1h: number | null;
  change24h: number | null;
  change7d: number | null;
  marketCap: number | null;
  volume24h: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  ath: number | null;
  athChangePct: number | null;
  /** About 7 days of prices, oldest first, downsampled for sparklines. */
  sparkline: number[];
}

export interface GlobalStats {
  totalMarketCap: number;
  marketCapChange24h: number | null;
  btcDominance: number | null;
}

export interface TrendingCoin {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  rank: number | null;
}

export interface FearGreed {
  value: number;
  label: string;
  /** Daily values, oldest first. */
  history: { t: number; value: number }[];
}

/** One piece of the snapshot, stamped with when and where it came from. */
export interface Part<T> {
  data: T;
  asOf: number;
  source: SourceName;
}

export interface Snapshot {
  /** Asset sparklines are empty here; they come from `sparklines`. */
  markets: Part<Asset[]> | null;
  /** 7-day price sparklines by asset id, refreshed hourly (they are big to download and parse). */
  sparklines?: Part<Record<string, number[]>> | null;
  global: Part<GlobalStats> | null;
  trending: Part<TrendingCoin[]> | null;
  fearGreed: Part<FearGreed> | null;
}

export interface Candle {
  /** Open time, ms since epoch. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type Range = '7d' | '30d' | '1y';
export const RANGES: Range[] = ['7d', '30d', '1y'];

export interface CandleSet {
  id: string;
  range: Range;
  candles: Candle[];
  asOf: number;
  source: SourceName;
}

export interface LivePrice {
  price: number;
  change24h: number;
}

export interface PriceMap {
  /** Keyed by upper-case symbol, e.g. "BTC". */
  prices: Record<string, LivePrice>;
  asOf: number;
  source: SourceName;
}

export const emptySnapshot = (): Snapshot => ({ markets: null, sparklines: null, global: null, trending: null, fearGreed: null });
