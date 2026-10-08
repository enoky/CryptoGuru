import { isCurrency, type CurrencyCode } from '../../shared/currency';
import { lsGet, lsSet } from './storage';

const KEY = 'currency';

export const money = $state({
  code: ((): CurrencyCode => {
    const saved = lsGet<unknown>(KEY, 'USD');
    return isCurrency(saved) ? saved : 'USD';
  })(),
  /** USD → currency, from the latest snapshot. */
  rates: {} as Record<string, number>,
});

export function setCurrency(code: CurrencyCode) {
  money.code = code;
  lsSet(KEY, code);
}

export function setRates(rates: Record<string, number> | undefined) {
  if (rates && Object.keys(rates).length) money.rates = rates;
}

/** The currency actually used for display: falls back to USD while its rate is unknown. */
export function displayCurrency(): { code: CurrencyCode; rate: number } {
  if (money.code === 'USD') return { code: 'USD', rate: 1 };
  const rate = money.rates[money.code];
  return rate ? { code: money.code, rate } : { code: 'USD', rate: 1 };
}

export const currencyUnavailable = () => money.code !== 'USD' && !money.rates[money.code];
