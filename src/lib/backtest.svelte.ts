import { dayKey, type BacktestResult } from '../../shared/backtest';
import { isStablecoin } from '../../shared/signals';
import type { Asset, Candle } from '../../shared/types';
import { loadFearGreedHistory, loadHistory } from './api';
import type { BacktestJob, BacktestMessage } from './backtest.worker';
import { assets } from './market.svelte';
import { idbGet, idbSet } from './storage';

/** The largest coins by market cap, stablecoins excluded. */
export const BACKTEST_COINS = 20;
const KEY = 'backtest:v1';

interface Cached {
  day: number;
  result: BacktestResult;
  sources: string[];
}

export const backtest = $state({
  status: 'idle' as 'idle' | 'loading' | 'computing' | 'done' | 'error',
  /** Coins downloaded / analysed so far. */
  done: 0,
  total: 0,
  result: null as BacktestResult | null,
  sources: [] as string[],
  error: null as string | null,
  /** Coins whose history couldn't be downloaded. */
  missing: [] as string[],
});

let running = false;

/** Use today's cached result if there is one; otherwise download and compute. */
export async function runBacktest(force = false) {
  if (running) return;
  running = true;
  try {
    const today = dayKey(Date.now());
    const cached = force ? undefined : await idbGet<Cached>(KEY);
    if (cached?.day === today && cached.result.coins.length) {
      Object.assign(backtest, { status: 'done', result: cached.result, sources: cached.sources, error: null });
      return;
    }
    const coins = assets()
      .filter((a) => !isStablecoin(a.symbol))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, BACKTEST_COINS);
    if (coins.length === 0) throw new Error('Market data hasn’t loaded yet.');

    Object.assign(backtest, { status: 'loading', done: 0, total: coins.length, error: null, missing: [] });
    const [fearGreed, histories] = await Promise.all([loadFearGreedHistory().catch(() => []), downloadAll(coins)]);
    const ok = histories.filter((h): h is NonNullable<typeof h> => !!h);
    backtest.missing = coins.filter((c) => !ok.some((h) => h.id === c.id)).map((c) => c.name);
    if (ok.length === 0) throw new Error('Couldn’t download any price history.');

    Object.assign(backtest, { status: 'computing', done: 0, total: ok.length });
    const result = await compute({ coins: ok.map(({ id, candles }) => ({ id, candles })), fearGreed, now: Date.now() });
    const sources = [...new Set(ok.map((h) => h.source))];
    Object.assign(backtest, { status: 'done', result, sources });
    void idbSet(KEY, { day: today, result, sources } satisfies Cached);
  } catch (err) {
    Object.assign(backtest, { status: 'error', error: err instanceof Error ? err.message : 'Backtest failed' });
  } finally {
    running = false;
  }
}

/** Four downloads at a time; a coin that fails is left out rather than failing everything. */
async function downloadAll(coins: Asset[]) {
  const out: ({ id: string; candles: Candle[]; source: string } | null)[] = new Array(coins.length).fill(null);
  let next = 0;
  const lane = async () => {
    while (next < coins.length) {
      const i = next++;
      const c = coins[i];
      try {
        const set = await loadHistory(c.id, c.symbol, c.price);
        out[i] = { id: c.id, candles: set.candles, source: set.source };
      } catch {
        out[i] = null;
      }
      backtest.done++;
    }
  };
  await Promise.all([lane(), lane(), lane(), lane()]);
  return out;
}

function compute(job: BacktestJob): Promise<BacktestResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./backtest.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<BacktestMessage>) => {
      if (e.data.type === 'progress') backtest.done = e.data.done;
      else {
        resolve(e.data.result);
        worker.terminate();
      }
    };
    worker.onerror = (e) => {
      reject(new Error(e.message || 'Backtest worker failed'));
      worker.terminate();
    };
    worker.postMessage(job);
  });
}
