import type { FetchFn } from './http';

export class BudgetExceeded extends Error {
  constructor() {
    super('Request budget for this run is used up');
  }
}

/**
 * Wraps fetch with a hard cap on calls. Free Workers may make only 50
 * outbound requests per run; going over makes every later fetch throw, so we
 * stop ourselves first and leave headroom.
 */
export function budgetedFetch(fetchFn: FetchFn, max: number) {
  let used = 0;
  const fn = ((...args: Parameters<FetchFn>) => {
    if (used >= max) return Promise.reject(new BudgetExceeded());
    used++;
    return fetchFn(...args);
  }) as FetchFn;
  return Object.assign(fn, { remaining: () => max - used, used: () => used });
}
