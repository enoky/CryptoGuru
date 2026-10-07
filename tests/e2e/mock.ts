import type { Page } from '@playwright/test';
import type { Asset, CandleSet, Range, Snapshot } from '../../shared/types';

const NAMES = [
  ['bitcoin', 'BTC', 'Bitcoin', 64210],
  ['ethereum', 'ETH', 'Ethereum', 3180.5],
  ['tether', 'USDT', 'Tether', 1],
  ['solana', 'SOL', 'Solana', 151.2],
  ['ripple', 'XRP', 'XRP', 0.5234],
  ['dogecoin', 'DOGE', 'Dogecoin', 0.1234],
  ['shiba-inu', 'SHIB', 'Shiba Inu', 0.00001834],
  ['wrapped-bitcoin-with-a-very-long-name', 'WBTCLONG', 'Wrapped Bitcoin With A Very Long Name', 1234567.89],
] as const;

export function makeSnapshot(asOf = Date.now(), count = 60): Snapshot {
  const data: Asset[] = Array.from({ length: count }, (_, i) => {
    const [id, symbol, name, price] = NAMES[i] ?? [`coin-${i}`, `C${i}`, `Coin ${i}`, 10 + i];
    const change = ((i * 37) % 21) - 10 + 0.37;
    return {
      id,
      symbol,
      name,
      image: `https://coin-images.coingecko.com/coins/${id}.png`,
      rank: i + 1,
      price,
      change1h: change / 10,
      change24h: change,
      change7d: -change * 1.5,
      marketCap: price * 1e9 / (i + 1),
      volume24h: price * 1e8,
      circulatingSupply: 19_700_000,
      totalSupply: 21_000_000,
      maxSupply: i % 2 ? null : 21_000_000,
      ath: price * 1.3,
      athChangePct: -23.1,
      sparkline: Array.from({ length: 42 }, (_, k) => price * (1 + Math.sin((k + i) / 5) / 20)),
    };
  });
  return {
    markets: { data, asOf, source: 'coingecko' },
    global: { data: { totalMarketCap: 2.41e12, marketCapChange24h: 1.23, btcDominance: 56.1 }, asOf, source: 'coingecko' },
    trending: {
      data: data.slice(3, 9).map((a) => ({ id: a.id, symbol: a.symbol, name: a.name, image: a.image, rank: a.rank })),
      asOf,
      source: 'coingecko',
    },
    fearGreed: {
      data: { value: 45, label: 'Fear', history: Array.from({ length: 30 }, (_, k) => ({ t: asOf - (29 - k) * 86_400_000, value: 30 + k })) },
      asOf,
      source: 'alternative.me',
    },
  };
}

const STEP: Record<Range, number> = { '7d': 3_600_000, '30d': 4 * 3_600_000, '1y': 86_400_000 };
const COUNT: Record<Range, number> = { '7d': 168, '30d': 180, '1y': 365 };

export function makeCandles(id: string, range: Range, price: number): CandleSet {
  const now = Date.now();
  const n = COUNT[range];
  const candles = Array.from({ length: n }, (_, i) => {
    const c = price * (0.85 + 0.15 * (i / (n - 1)) + Math.sin(i / 7) / 40);
    return { t: now - (n - i) * STEP[range], o: c, h: c * 1.01, l: c * 0.99, c, v: 1e6 };
  });
  return { id, range, candles, asOf: now, source: 'binance' };
}

/**
 * Serve /api from mock data and block every other host, so tests never
 * touch real APIs. Pass `apiDown` to simulate the Worker being unreachable.
 */
export async function mockApi(page: Page, opts: { apiDown?: boolean; snapshot?: Snapshot } = {}) {
  const snapshot = opts.snapshot ?? makeSnapshot();
  await page.route(
    (url) => url.hostname !== 'localhost',
    (route) => route.abort(),
  );
  await page.route('**/api/**', (route) => {
    if (opts.apiDown) return route.fulfill({ status: 503, body: '{"error":"down"}', contentType: 'application/json' });
    const url = new URL(route.request().url());
    if (url.pathname === '/api/snapshot') return route.fulfill({ json: snapshot });
    if (url.pathname === '/api/prices') return route.fulfill({ json: { prices: { BTC: { price: 64300, change24h: 2.2 } }, asOf: Date.now(), source: 'binance' } });
    const m = url.pathname.match(/^\/api\/candles\/(.+)$/);
    if (m) {
      const asset = snapshot.markets!.data.find((a) => a.id === m[1]);
      return route.fulfill({ json: makeCandles(m[1], (url.searchParams.get('range') ?? '7d') as Range, asset?.price ?? 1) });
    }
    return route.fulfill({ status: 404, json: { error: 'not found' } });
  });
}
