/** Deterministic fake market data for browser tests, Lighthouse and `MOCK_API=1` local runs. */
import { roundSig } from '../../shared/series';
import { computeSignal, emptySignalsDoc, isStablecoin, type SignalsDoc } from '../../shared/signals';
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
      sparkline: Array.from({ length: 42 }, (_, k) => roundSig(price * (1 + Math.sin((k + i) / 5) / 20))),
    };
  });
  return {
    markets: { data, asOf, source: 'coingecko' },
    global: {
      data: { totalMarketCap: 2.41e12, marketCapChange24h: 1.23, btcDominance: 56.1, fx: { EUR: 0.92, GBP: 0.79, JPY: 150 } },
      asOf,
      source: 'coingecko',
    },
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

/** Odd-length ids trend down, even-length ids trend up, so the mock has both bullish and bearish coins. */
const trendsUp = (id: string) => id.length % 2 === 0;

export function makeCandles(id: string, range: Range, price: number): CandleSet {
  const now = Date.now();
  const n = COUNT[range];
  const up = trendsUp(id);
  const candles = Array.from({ length: n }, (_, i) => {
    const progress = i / (n - 1);
    const c = price * ((up ? 0.85 + 0.15 * progress : 1.15 - 0.15 * progress) + Math.sin(i / 7) / 40);
    return { t: now - (n - 1 - i) * STEP[range], o: c, h: c * 1.01, l: c * 0.99, c, v: 1e6 };
  });
  return { id, range, candles, asOf: now, source: 'binance' };
}

/** ~1000 daily candles: a seeded random walk per coin, ending at its current price. */
export function makeHistory(id: string, price: number): CandleSet {
  let seed = [...id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rand = () => ((seed = (seed * 1_664_525 + 1_013_904_223) >>> 0) / 2 ** 32) - 0.5;
  const n = 1000;
  const walk = [1];
  for (let i = 1; i < n; i++) walk.push(walk[i - 1] * Math.exp(0.0005 + 0.06 * rand()));
  const scale = price / walk[n - 1];
  const day = 86_400_000;
  const today = Math.floor(Date.now() / day) * day;
  const candles = walk.map((w, i) => {
    const c = w * scale;
    return { t: today - (n - 1 - i) * day, o: c, h: c * 1.01, l: c * 0.99, c, v: 1e6 * (1 + (i % 5)) };
  });
  return { id, range: '1y', candles, asOf: Date.now(), source: 'binance' };
}

export function makeSignals(snapshot: Snapshot): SignalsDoc {
  const doc = emptySignalsDoc();
  const now = Date.now();
  for (const a of snapshot.markets!.data) {
    if (isStablecoin(a.symbol)) continue;
    const s = computeSignal(a.id, makeCandles(a.id, '1y', a.price).candles, 'binance', snapshot.fearGreed?.data.value ?? null, now);
    if (s) doc.items[a.id] = s;
  }
  doc.asOf = now;
  return doc;
}

export interface MockOptions {
  apiDown?: boolean;
  signalsDown?: boolean;
  snapshot?: Snapshot;
}

/** Answers one /api request from mock data. Shared by Playwright and the MOCK_API preview server. */
export function createMockApi(opts: MockOptions = {}) {
  const snapshot = opts.snapshot ?? makeSnapshot();
  const signals = makeSignals(snapshot);
  const find = (id: string) => snapshot.markets!.data.find((a) => a.id === id);
  const day = 86_400_000;

  return (url: URL): { status: number; body: unknown } => {
    if (opts.apiDown) return { status: 503, body: { error: 'down' } };
    const p = url.pathname;
    if (p === '/api/snapshot') return { status: 200, body: snapshot };
    if (p === '/api/signals') return opts.signalsDown ? { status: 503, body: { error: 'down' } } : { status: 200, body: signals };
    if (p === '/api/prices') return { status: 200, body: { prices: { BTC: { price: 64300, change24h: 2.2 } }, asOf: Date.now(), source: 'binance' } };
    if (p === '/api/fear-greed/history') {
      const today = Math.floor(Date.now() / day) * day;
      return { status: 200, body: Array.from({ length: 1200 }, (_, i) => ({ t: today - (1199 - i) * day, value: Math.round(50 + 45 * Math.sin(i / 25)) })) };
    }
    const hist = p.match(/^\/api\/history\/(.+)$/);
    if (hist) {
      const asset = find(hist[1]);
      return asset ? { status: 200, body: makeHistory(hist[1], asset.price) } : { status: 404, body: { error: 'no' } };
    }
    const m = p.match(/^\/api\/candles\/(.+)$/);
    if (m) return { status: 200, body: makeCandles(m[1], (url.searchParams.get('range') ?? '7d') as Range, find(m[1])?.price ?? 1) };
    if (p === '/api/health') return { status: 200, body: { ok: true, mock: true } };
    return { status: 404, body: { error: 'not found' } };
  };
}
