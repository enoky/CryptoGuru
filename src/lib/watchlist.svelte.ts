import { lsGet, lsSet } from './storage';

const KEY = 'watchlist:v1';

export const watchlist = $state({ ids: lsGet<string[]>(KEY, []).filter((x) => typeof x === 'string') });

const save = () => lsSet(KEY, watchlist.ids);

export const isWatched = (id: string) => watchlist.ids.includes(id);

export function toggleWatch(id: string) {
  watchlist.ids = isWatched(id) ? watchlist.ids.filter((x) => x !== id) : [...watchlist.ids, id];
  save();
}

export function moveWatch(id: string, delta: -1 | 1) {
  const i = watchlist.ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= watchlist.ids.length) return;
  const next = [...watchlist.ids];
  [next[i], next[j]] = [next[j], next[i]];
  watchlist.ids = next;
  save();
}

export function replaceWatch(ids: string[]) {
  watchlist.ids = ids;
  save();
}
