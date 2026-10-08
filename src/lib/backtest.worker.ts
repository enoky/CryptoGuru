/// <reference lib="webworker" />
// Runs the backtest off the main thread so scrolling stays smooth on phones.
import { completedDays, dayKey, emptyResult, marketHistory, readings, tally } from '../../shared/backtest';
import type { Candle } from '../../shared/types';

export interface BacktestJob {
  coins: { id: string; candles: Candle[] }[];
  fearGreed: { t: number; value: number }[];
  now: number;
}

export type BacktestMessage = { type: 'progress'; done: number; total: number } | { type: 'done'; result: ReturnType<typeof emptyResult> };

self.onmessage = (e: MessageEvent<BacktestJob>) => {
  const { coins, fearGreed, now } = e.data;
  const fg = new Map(fearGreed.map((r) => [dayKey(r.t), r.value]));
  const completed = coins.map((c) => ({ id: c.id, candles: completedDays(c.candles, now) }));
  // Bitcoin's 90-day return and breadth (over these coins) for each day.
  const market = marketHistory(completed);
  let result = emptyResult();
  completed.forEach((coin, i) => {
    result = tally(result, coin.id, readings(coin.id, coin.candles, market, fg));
    self.postMessage({ type: 'progress', done: i + 1, total: coins.length } satisfies BacktestMessage);
  });
  self.postMessage({ type: 'done', result } satisfies BacktestMessage);
};
