import * as v from 'valibot';
import { fetchJson, type FetchFn } from '../http';
import { downsample } from '../series';
import type { Asset, Candle, GlobalStats, Range, TrendingCoin } from '../types';
import { finiteOrNull, isPositive, parseItems, parseOne, safeImage } from '../validate';

export const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

const num = v.nullish(v.number());

const MarketSchema = v.object({
  id: v.string(),
  symbol: v.string(),
  name: v.string(),
  image: v.nullish(v.string()),
  current_price: v.number(),
  market_cap: num,
  market_cap_rank: num,
  total_volume: num,
  circulating_supply: num,
  total_supply: num,
  max_supply: num,
  ath: num,
  ath_change_percentage: num,
  price_change_percentage_1h_in_currency: num,
  price_change_percentage_24h_in_currency: num,
  price_change_percentage_7d_in_currency: num,
  // Checked by hand below (isPositive): validating 100 × 168 numbers by schema costs too much CPU in the Worker.
  sparkline_in_7d: v.nullish(v.object({ price: v.array(v.unknown()) })),
});

const GlobalSchema = v.object({
  data: v.object({
    total_market_cap: v.record(v.string(), v.number()),
    market_cap_change_percentage_24h_usd: num,
    market_cap_percentage: v.record(v.string(), v.number()),
  }),
});

const TrendingSchema = v.object({
  coins: v.array(
    v.object({
      item: v.object({
        id: v.string(),
        symbol: v.string(),
        name: v.string(),
        small: v.nullish(v.string()),
        thumb: v.nullish(v.string()),
        market_cap_rank: num,
      }),
    }),
  ),
});

const ChartSchema = v.object({
  prices: v.array(v.tuple([v.number(), v.nullable(v.number())])),
  total_volumes: v.array(v.tuple([v.number(), v.nullable(v.number())])),
});

export interface CoinGeckoOptions {
  /** Free Demo API key. Only ever used server-side. */
  apiKey?: string;
  retries?: number;
  baseDelayMs?: number;
}

const get = (fetchFn: FetchFn, path: string, o: CoinGeckoOptions) =>
  fetchJson(fetchFn, `${COINGECKO_BASE}${path}`, {
    headers: o.apiKey ? { 'x-cg-demo-api-key': o.apiKey } : {},
    retries: o.retries,
    baseDelayMs: o.baseDelayMs,
  });

const MARKETS_PATH = '/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&price_change_percentage=1h%2C24h%2C7d';

/** Top 100 coins. Without sparklines (the default) the response is ~8× smaller and much cheaper to validate. */
export async function fetchMarkets(fetchFn: FetchFn, o: CoinGeckoOptions & { sparkline?: boolean } = {}): Promise<Asset[]> {
  const raw = await get(fetchFn, `${MARKETS_PATH}&sparkline=${o.sparkline ? 'true' : 'false'}`, o);
  const items = parseItems(MarketSchema, raw, 'CoinGecko markets');
  return items
    .filter((m) => isPositive(m.current_price))
    .map((m, i) => ({
      id: m.id,
      symbol: m.symbol.toUpperCase(),
      name: m.name,
      image: safeImage(m.image),
      rank: m.market_cap_rank ?? i + 1,
      price: m.current_price,
      change1h: finiteOrNull(m.price_change_percentage_1h_in_currency),
      change24h: finiteOrNull(m.price_change_percentage_24h_in_currency),
      change7d: finiteOrNull(m.price_change_percentage_7d_in_currency),
      marketCap: finiteOrNull(m.market_cap),
      volume24h: finiteOrNull(m.total_volume),
      circulatingSupply: finiteOrNull(m.circulating_supply),
      totalSupply: finiteOrNull(m.total_supply),
      maxSupply: finiteOrNull(m.max_supply),
      ath: finiteOrNull(m.ath),
      athChangePct: finiteOrNull(m.ath_change_percentage),
      sparkline: downsample((m.sparkline_in_7d?.price ?? []).filter(isPositive) as number[], 42),
    }));
}

/** 7-day sparklines for the top 100, by id, downsampled to 42 points. */
export async function fetchSparklines(fetchFn: FetchFn, o: CoinGeckoOptions = {}): Promise<Record<string, number[]>> {
  const assets = await fetchMarkets(fetchFn, { ...o, sparkline: true });
  const out: Record<string, number[]> = {};
  for (const a of assets) if (a.sparkline.length > 1) out[a.id] = a.sparkline;
  if (Object.keys(out).length === 0) throw new Error('CoinGecko: no sparklines');
  return out;
}

export async function fetchGlobal(fetchFn: FetchFn, o: CoinGeckoOptions = {}): Promise<GlobalStats> {
  const { data } = parseOne(GlobalSchema, await get(fetchFn, '/global', o), 'CoinGecko global');
  const total = data.total_market_cap.usd;
  if (!isPositive(total)) throw new Error('CoinGecko global: missing USD market cap');
  return {
    totalMarketCap: total,
    marketCapChange24h: finiteOrNull(data.market_cap_change_percentage_24h_usd),
    btcDominance: finiteOrNull(data.market_cap_percentage.btc),
  };
}

export async function fetchTrending(fetchFn: FetchFn, o: CoinGeckoOptions = {}): Promise<TrendingCoin[]> {
  const { coins } = parseOne(TrendingSchema, await get(fetchFn, '/search/trending', o), 'CoinGecko trending');
  return coins.slice(0, 10).map(({ item }) => ({
    id: item.id,
    symbol: item.symbol.toUpperCase(),
    name: item.name,
    image: safeImage(item.small ?? item.thumb),
    rank: finiteOrNull(item.market_cap_rank),
  }));
}

const DAYS: Record<Range, string> = { '7d': '7', '30d': '30', '1y': '365&interval=daily' };

/** CoinGecko only gives prices, not OHLC, so each candle is flat (o = h = l = c). */
export async function fetchCandles(fetchFn: FetchFn, id: string, range: Range, o: CoinGeckoOptions & { days?: number } = {}): Promise<Candle[]> {
  const days = range === '1y' && o.days ? `${o.days}&interval=daily` : DAYS[range];
  const raw = await get(fetchFn, `/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}`, o);
  const chart = parseOne(ChartSchema, raw, 'CoinGecko chart');
  const volumes = new Map(chart.total_volumes.map(([t, vol]) => [t, vol ?? 0]));
  return chart.prices
    .filter((p): p is [number, number] => isPositive(p[1]))
    .map(([t, p]) => ({ t, o: p, h: p, l: p, c: p, v: volumes.get(t) ?? 0 }));
}
