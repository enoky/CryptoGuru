import { afterEach, describe, expect, it } from 'vitest';
import { fxFromMarketCaps, isCurrency } from '../../shared/currency';
import { formatMoneyCompact, formatPrice } from '../../src/lib/format';
import { currencyUnavailable, displayCurrency, money, setRates } from '../../src/lib/money.svelte';

afterEach(() => {
  money.code = 'USD';
  money.rates = {};
});

describe('fxFromMarketCaps', () => {
  it('divides each currency total by the USD total', () => {
    expect(fxFromMarketCaps({ usd: 100, eur: 92, gbp: 79, btc: 0.0015 })).toEqual({ EUR: 0.92, GBP: 0.79 });
  });
  it('ignores bad values', () => {
    expect(fxFromMarketCaps({ usd: 0, eur: 92 })).toEqual({});
    expect(fxFromMarketCaps({ usd: 100, eur: -1, gbp: NaN })).toEqual({});
  });
  it('knows the supported codes', () => {
    expect(isCurrency('EUR')).toBe(true);
    expect(isCurrency('XYZ')).toBe(false);
  });
});

describe('display currency', () => {
  it('converts and formats in the chosen currency', () => {
    setRates({ EUR: 0.92, JPY: 150 });
    money.code = 'EUR';
    expect(formatPrice(64_000)).toBe('€58,880');
    expect(formatPrice(2.5)).toBe('€2.30');
    expect(formatMoneyCompact(2.4e12)).toBe('€2.21T');
  });

  it('shows no decimals for currencies without a minor unit', () => {
    setRates({ JPY: 150 });
    money.code = 'JPY';
    expect(formatPrice(3)).toBe('¥450');
  });

  it('falls back to US dollars while a rate is missing', () => {
    money.code = 'GBP';
    expect(currencyUnavailable()).toBe(true);
    expect(displayCurrency()).toEqual({ code: 'USD', rate: 1 });
    expect(formatPrice(2.5)).toBe('$2.50');
  });

  it('keeps the last rates when an update has none', () => {
    setRates({ EUR: 0.9 });
    setRates(undefined);
    setRates({});
    expect(money.rates).toEqual({ EUR: 0.9 });
  });
});
