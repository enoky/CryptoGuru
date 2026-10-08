import { BINANCE_BASE } from '../../shared/sources/binance';
import { COINGECKO_BASE } from '../../shared/sources/coingecko';
import { COINPAPRIKA_BASE } from '../../shared/sources/coinpaprika';
import { FEAR_GREED_HISTORY_URL, FEAR_GREED_URL } from '../../shared/sources/feargreed';
import { KRAKEN_BASE } from '../../shared/sources/kraken';
import type { Handler } from './mockFetch';

export const cgMarket = (id: string, symbol: string, price: number, rank: number, extra: Record<string, unknown> = {}) => ({
  id,
  symbol,
  name: id[0].toUpperCase() + id.slice(1),
  image: `https://coin-images.coingecko.com/${id}.png`,
  current_price: price,
  market_cap: price * 1e6,
  market_cap_rank: rank,
  total_volume: price * 1e5,
  circulating_supply: 1e6,
  total_supply: 1e6,
  max_supply: null,
  ath: price * 1.5,
  ath_change_percentage: -33.3,
  price_change_percentage_1h_in_currency: 0.1,
  price_change_percentage_24h_in_currency: 2.5,
  price_change_percentage_7d_in_currency: -4,
  sparkline_in_7d: { price: Array.from({ length: 168 }, (_, i) => price * (1 + Math.sin(i / 10) / 50)) },
  ...extra,
});

export const CG_MARKETS = [cgMarket('bitcoin', 'btc', 64000, 1), cgMarket('ethereum', 'eth', 3200, 2), cgMarket('tether', 'usdt', 1, 3)];

export const CG_GLOBAL = {
  data: {
    total_market_cap: { usd: 2.4e12, eur: 2.4e12 * 0.92, jpy: 2.4e12 * 150, btc: 3.75e7 },
    market_cap_change_percentage_24h_usd: 1.2,
    market_cap_percentage: { btc: 56.1, eth: 12 },
  },
};

export const CG_TRENDING = {
  coins: [{ item: { id: 'ethereum', symbol: 'eth', name: 'Ethereum', small: 'https://img/eth.png', thumb: null, market_cap_rank: 2 } }],
};

export const FNG = {
  data: [
    { value: '45', value_classification: 'Fear', timestamp: '1700086400' },
    { value: '60', value_classification: 'Greed', timestamp: '1700000000' },
  ],
};

export const PAPRIKA_TICKERS = [
  {
    id: 'eth-ethereum',
    name: 'Ethereum',
    symbol: 'ETH',
    rank: 2,
    circulating_supply: 1e6,
    total_supply: 1e6,
    max_supply: 0,
    quotes: { USD: { price: 3150, volume_24h: 1e9, market_cap: 3e11, percent_change_1h: 0, percent_change_24h: 1, percent_change_7d: 2, ath_price: 4800, percent_from_price_ath: -34 } },
  },
  {
    id: 'btc-bitcoin',
    name: 'Bitcoin',
    symbol: 'BTC',
    rank: 1,
    circulating_supply: 1.9e7,
    total_supply: 1.9e7,
    max_supply: 2.1e7,
    quotes: { USD: { price: 63900, volume_24h: 3e10, market_cap: 1.2e12, percent_change_1h: 0.1, percent_change_24h: 2, percent_change_7d: -3, ath_price: 73000, percent_from_price_ath: -12 } },
  },
];

export const PAPRIKA_GLOBAL = { market_cap_usd: 2.3e12, market_cap_change_24h: 0.8, bitcoin_dominance_percentage: 55.5 };

/** 1h/4h/1d klines ending near `price`. */
export const klines = (price: number, n = 168) =>
  Array.from({ length: n }, (_, i) => {
    const p = price * (0.95 + (0.05 * i) / (n - 1));
    return [1_700_000_000_000 + i * 3_600_000, String(p), String(p * 1.01), String(p * 0.99), String(p), '100', 0, '0', 0, '0', '0', '0'];
  });

export const cgChart = (price: number, n = 168) => ({
  prices: Array.from({ length: n }, (_, i) => [1_700_000_000_000 + i * 3_600_000, price]),
  total_volumes: Array.from({ length: n }, (_, i) => [1_700_000_000_000 + i * 3_600_000, 1e9]),
});

/**
 * Every upstream answering normally. `over` replaces individual routes;
 * every route under a `down` prefix answers 503.
 */
export const healthyRoutes = (over: Record<string, Handler> = {}, down: string[] = []): Record<string, Handler> => {
  const routes: Record<string, Handler> = {
  [`${COINGECKO_BASE}/coins/markets`]: (url) => (url.includes('sparkline=true') ? CG_MARKETS : CG_MARKETS.map((m) => ({ ...m, sparkline_in_7d: null }))),
  [`${COINGECKO_BASE}/global`]: () => CG_GLOBAL,
  [`${COINGECKO_BASE}/search/trending`]: () => CG_TRENDING,
  [`${COINGECKO_BASE}/coins/`]: () => cgChart(64000),
  [FEAR_GREED_URL]: () => FNG,
  [FEAR_GREED_HISTORY_URL]: () => ({
    data: Array.from({ length: 40 }, (_, i) => ({ value: String(20 + i), value_classification: 'x', timestamp: String(1_700_000_000 - i * 86_400) })),
  }),
  [`${COINPAPRIKA_BASE}/tickers`]: () => PAPRIKA_TICKERS,
  [`${COINPAPRIKA_BASE}/global`]: () => PAPRIKA_GLOBAL,
  [`${BINANCE_BASE}/ticker/24hr`]: () => [
    { symbol: 'BTCUSDT', openPrice: '62000', lastPrice: '64100' },
    { symbol: 'ETHBTC', openPrice: '0.05', lastPrice: '0.05' },
  ],
  [`${BINANCE_BASE}/klines`]: (url) => klines(url.includes('symbol=ETH') ? 3200 : 64000),
  [`${KRAKEN_BASE}/OHLC`]: () => ({ error: [], result: { XXBTZUSD: klines(64000).map((k) => [Number(k[0]) / 1000, ...k.slice(1, 5), '0', k[5], 1]), last: 1 } }),
    ...over,
  };
  for (const key of Object.keys(routes)) if (down.some((d) => key.startsWith(d))) routes[key] = () => 503;
  return routes;
};
