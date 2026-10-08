import * as v from 'valibot';
import { fetchJson, type FetchFn } from '../http';
import type { Asset, GlobalStats } from '../types';
import { finiteOrNull, isPositive, parseItems, parseOne } from '../validate';

export const COINPAPRIKA_BASE = 'https://api.coinpaprika.com/v1';

const num = v.nullish(v.number());

const TickerSchema = v.object({
  id: v.string(),
  name: v.string(),
  symbol: v.string(),
  rank: v.number(),
  circulating_supply: num,
  total_supply: num,
  max_supply: num,
  quotes: v.object({
    USD: v.object({
      price: v.number(),
      volume_24h: num,
      market_cap: num,
      percent_change_1h: num,
      percent_change_24h: num,
      percent_change_7d: num,
      ath_price: num,
      percent_from_price_ath: num,
    }),
  }),
});

const GlobalSchema = v.object({
  market_cap_usd: v.number(),
  market_cap_change_24h: num,
  bitcoin_dominance_percentage: num,
});

/**
 * CoinPaprika ids look like "btc-bitcoin". Dropping the symbol prefix gives
 * "bitcoin", which matches the CoinGecko id for most large coins, so
 * watchlists and links keep working while this fallback is in use.
 */
export function toAppId(paprikaId: string, symbol: string): string {
  const prefix = `${symbol.toLowerCase()}-`;
  return paprikaId.startsWith(prefix) ? paprikaId.slice(prefix.length) : paprikaId;
}

const zeroAsNull = (n: number | null | undefined) => (n ? finiteOrNull(n) : null);

export async function fetchMarkets(fetchFn: FetchFn, o: { retries?: number; baseDelayMs?: number } = {}): Promise<Asset[]> {
  const raw = await fetchJson(fetchFn, `${COINPAPRIKA_BASE}/tickers?quotes=USD`, o);
  return parseItems(TickerSchema, raw, 'CoinPaprika tickers')
    .filter((t) => t.rank > 0 && isPositive(t.quotes.USD.price))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 100)
    .map((t) => {
      const q = t.quotes.USD;
      return {
        id: toAppId(t.id, t.symbol),
        symbol: t.symbol.toUpperCase(),
        name: t.name,
        image: `https://static.coinpaprika.com/coin/${encodeURIComponent(t.id)}/logo.png`,
        rank: t.rank,
        price: q.price,
        change1h: finiteOrNull(q.percent_change_1h),
        change24h: finiteOrNull(q.percent_change_24h),
        change7d: finiteOrNull(q.percent_change_7d),
        marketCap: zeroAsNull(q.market_cap),
        volume24h: zeroAsNull(q.volume_24h),
        circulatingSupply: zeroAsNull(t.circulating_supply),
        totalSupply: zeroAsNull(t.total_supply),
        maxSupply: zeroAsNull(t.max_supply),
        ath: zeroAsNull(q.ath_price),
        athChangePct: finiteOrNull(q.percent_from_price_ath),
        sparkline: [],
      };
    });
}

export async function fetchGlobal(fetchFn: FetchFn, o: { retries?: number; baseDelayMs?: number } = {}): Promise<GlobalStats> {
  const g = parseOne(GlobalSchema, await fetchJson(fetchFn, `${COINPAPRIKA_BASE}/global`, o), 'CoinPaprika global');
  if (!isPositive(g.market_cap_usd)) throw new Error('CoinPaprika global: missing market cap');
  return {
    totalMarketCap: g.market_cap_usd,
    marketCapChange24h: finiteOrNull(g.market_cap_change_24h),
    btcDominance: finiteOrNull(g.bitcoin_dominance_percentage),
  };
}
