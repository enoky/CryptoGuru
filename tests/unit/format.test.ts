import { describe, expect, it } from 'vitest';
import { direction, formatPct, formatPrice, formatUsdCompact, freshness } from '../../src/lib/format';

describe('format', () => {
  it('formats prices by size so they fit on a phone', () => {
    expect(formatPrice(64210.55)).toBe('$64,211');
    expect(formatPrice(2.5)).toBe('$2.50');
    expect(formatPrice(0.00001234)).toBe('$0.00001234');
    expect(formatPrice(null)).toBe('—');
    expect(formatPrice(NaN)).toBe('—');
  });

  it('shortens big dollar values', () => {
    expect(formatUsdCompact(1.23e12)).toBe('$1.23T');
    expect(formatUsdCompact(845_200_000)).toBe('$845.2M');
  });

  it('signs percentages with + and a true minus', () => {
    expect(formatPct(2.1)).toBe('+2.10%');
    expect(formatPct(-0.456)).toBe('−0.46%');
    expect(formatPct(0)).toBe('0.00%');
    expect(formatPct(undefined)).toBe('—');
  });

  it('grades freshness at 2× and 6× the refresh interval', () => {
    const ttl = 10 * 60_000;
    const now = 1_000_000_000;
    expect(freshness(now - ttl, ttl, now)).toBe('fresh');
    expect(freshness(now - 3 * ttl, ttl, now)).toBe('aging');
    expect(freshness(now - 7 * ttl, ttl, now)).toBe('stale');
  });

  it('gives a direction for colour and arrows', () => {
    expect(direction(1)).toBe('up');
    expect(direction(-1)).toBe('down');
    expect(direction(0)).toBe('flat');
    expect(direction(null)).toBe('flat');
  });
});
