import { describe, expect, it } from 'vitest';
import * as binance from '../../shared/sources/binance';
import * as coingecko from '../../shared/sources/coingecko';
import * as coinpaprika from '../../shared/sources/coinpaprika';
import { fetchFearGreed } from '../../shared/sources/feargreed';
import * as kraken from '../../shared/sources/kraken';
import { cgMarket, healthyRoutes } from '../helpers/data';
import { mockFetch } from '../helpers/mockFetch';

const o = { baseDelayMs: 0 };

describe('CoinGecko', () => {
  it('normalizes markets and downsamples sparklines', async () => {
    const assets = await coingecko.fetchMarkets(mockFetch(healthyRoutes()), o);
    expect(assets.map((a) => [a.id, a.symbol, a.rank])).toEqual([
      ['bitcoin', 'BTC', 1],
      ['ethereum', 'ETH', 2],
      ['tether', 'USDT', 3],
    ]);
    expect(assets[0].sparkline).toHaveLength(42);
    expect(assets[0].maxSupply).toBeNull();
  });

  it('drops coins with bad prices and non-https images', async () => {
    const f = mockFetch(
      healthyRoutes({
        [`${coingecko.COINGECKO_BASE}/coins/markets`]: () => [
          cgMarket('bitcoin', 'btc', 64000, 1, { image: 'http://insecure/btc.png' }),
          cgMarket('ethereum', 'eth', 3200, 2),
          cgMarket('bad', 'bad', 0, 3),
        ],
      }),
    );
    const assets = await coingecko.fetchMarkets(f, o);
    expect(assets.map((a) => a.id)).toEqual(['bitcoin', 'ethereum']);
    expect(assets[0].image).toBeNull();
  });

  it('fails when most of the list is malformed (API changed shape)', async () => {
    const f = mockFetch(healthyRoutes({ [`${coingecko.COINGECKO_BASE}/coins/markets`]: () => [{ id: 1 }, { id: 2 }, cgMarket('bitcoin', 'btc', 1, 1)] }));
    await expect(coingecko.fetchMarkets(f, o)).rejects.toThrow('failed validation');
  });

  it('sends the Demo key only when given', async () => {
    let seen: string | null = null;
    const f = (async (_url: string, init?: RequestInit) => {
      seen = new Headers(init?.headers).get('x-cg-demo-api-key');
      return new Response(JSON.stringify({ data: { total_market_cap: { usd: 1 }, market_cap_change_percentage_24h_usd: 0, market_cap_percentage: {} } }));
    }) as typeof fetch;
    await coingecko.fetchGlobal(f, { apiKey: 'k', ...o });
    expect(seen).toBe('k');
  });

  it('reads global stats and trending', async () => {
    const f = mockFetch(healthyRoutes());
    expect(await coingecko.fetchGlobal(f, o)).toEqual({ totalMarketCap: 2.4e12, marketCapChange24h: 1.2, btcDominance: 56.1 });
    expect((await coingecko.fetchTrending(f, o))[0]).toMatchObject({ id: 'ethereum', symbol: 'ETH', rank: 2 });
  });

  it('turns chart prices into flat candles', async () => {
    const candles = await coingecko.fetchCandles(mockFetch(healthyRoutes()), 'bitcoin', '7d', o);
    expect(candles).toHaveLength(168);
    expect(candles[0]).toMatchObject({ o: 64000, h: 64000, l: 64000, c: 64000, v: 1e9 });
  });
});

describe('CoinPaprika', () => {
  it('maps ids to CoinGecko-style ids and sorts by rank', async () => {
    const assets = await coinpaprika.fetchMarkets(mockFetch(healthyRoutes()), o);
    expect(assets.map((a) => a.id)).toEqual(['bitcoin', 'ethereum']);
    expect(assets[1].maxSupply).toBeNull(); // 0 means unknown
  });

  it('keeps ids that do not follow the symbol-name pattern', () => {
    expect(coinpaprika.toAppId('weird-id', 'XYZ')).toBe('weird-id');
  });
});

describe('Binance', () => {
  it('keeps USDT pairs and computes 24h change', async () => {
    const t = await binance.fetchTickers(mockFetch(healthyRoutes()), o);
    expect(Object.keys(t)).toEqual(['BTC']);
    expect(t.BTC.change24h).toBeCloseTo(((64100 - 62000) / 62000) * 100);
  });

  it('parses klines', async () => {
    const c = await binance.fetchCandles(mockFetch(healthyRoutes()), 'BTC', '7d', o);
    expect(c).toHaveLength(168);
    expect(c[167].c).toBeCloseTo(64000);
  });

  it('never asks for stablecoin pairs', async () => {
    const f = mockFetch(healthyRoutes());
    await expect(binance.fetchCandles(f, 'USDT', '7d', o)).rejects.toThrow('no USDT pair');
    expect(f.calls).toHaveLength(0);
  });
});

describe('Kraken', () => {
  it('uses XBT for Bitcoin and converts seconds to ms', async () => {
    const f = mockFetch(healthyRoutes());
    const c = await kraken.fetchCandles(f, 'BTC', '7d', o);
    expect(f.calls[0]).toContain('pair=XBTUSD');
    expect(c[0].t).toBe(1_700_000_000_000);
  });

  it('surfaces Kraken error messages', async () => {
    const f = mockFetch({ [kraken.KRAKEN_BASE]: () => ({ error: ['EQuery:Unknown asset pair'] }) });
    await expect(kraken.fetchCandles(f, 'ABC', '7d', o)).rejects.toThrow('Unknown asset pair');
  });
});

describe('Fear & Greed', () => {
  it('returns the latest value and history oldest first', async () => {
    const fg = await fetchFearGreed(mockFetch(healthyRoutes()), o);
    expect(fg.value).toBe(45);
    expect(fg.label).toBe('Fear');
    expect(fg.history.map((h) => h.value)).toEqual([60, 45]);
  });
});
