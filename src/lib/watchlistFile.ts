/** The watchlist backup file: plain JSON, so people can read it and nothing else is in it. */

export const WATCHLIST_FILE = 'cryptoguru-watchlist.json';
const ID = /^[a-z0-9-]{1,80}$/;
const MAX_ITEMS = 200;

export function serializeWatchlist(ids: string[], now = new Date()): string {
  return JSON.stringify({ app: 'CryptoGuru', version: 1, exportedAt: now.toISOString(), watchlist: ids }, null, 2);
}

/** Accepts our file, or simply a JSON list of coin ids. Throws a message fit to show the user. */
export function parseWatchlistFile(text: string): string[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t a CryptoGuru watchlist (it isn’t valid JSON).');
  }
  const list = Array.isArray(data) ? data : (data as { watchlist?: unknown })?.watchlist;
  if (!Array.isArray(list)) throw new Error('That file isn’t a CryptoGuru watchlist.');
  const ids = [...new Set(list.filter((x): x is string => typeof x === 'string' && ID.test(x)))].slice(0, MAX_ITEMS);
  if (ids.length === 0) throw new Error('That watchlist file has no coins in it.');
  return ids;
}

/** Imported coins are added after the current ones; nothing is removed. */
export function mergeWatchlist(current: string[], imported: string[]): { ids: string[]; added: number; already: number } {
  const have = new Set(current);
  const fresh = imported.filter((id) => !have.has(id));
  return { ids: [...current, ...fresh].slice(0, MAX_ITEMS), added: fresh.length, already: imported.length - fresh.length };
}
