import { describe, expect, it } from 'vitest';
import { mergeWatchlist, parseWatchlistFile, serializeWatchlist } from '../../src/lib/watchlistFile';

describe('watchlist file', () => {
  it('round-trips', () => {
    const text = serializeWatchlist(['bitcoin', 'ethereum'], new Date('2026-01-01T00:00:00Z'));
    expect(JSON.parse(text)).toMatchObject({ app: 'CryptoGuru', version: 1, exportedAt: '2026-01-01T00:00:00.000Z' });
    expect(parseWatchlistFile(text)).toEqual(['bitcoin', 'ethereum']);
  });

  it('accepts a plain list, dropping junk and duplicates', () => {
    expect(parseWatchlistFile('["bitcoin", "bitcoin", 42, "<script>", "Bad_ID", "solana"]')).toEqual(['bitcoin', 'solana']);
  });

  it('explains what is wrong with a bad file', () => {
    expect(() => parseWatchlistFile('not json')).toThrow('isn’t valid JSON');
    expect(() => parseWatchlistFile('{"foo": 1}')).toThrow('isn’t a CryptoGuru watchlist');
    expect(() => parseWatchlistFile('{"watchlist": []}')).toThrow('no coins');
  });

  it('adds new coins after the current ones and never removes any', () => {
    expect(mergeWatchlist(['a', 'b'], ['b', 'c'])).toEqual({ ids: ['a', 'b', 'c'], added: 1, already: 1 });
  });
});
