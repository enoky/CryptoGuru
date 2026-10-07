/** Display currencies. Data stays in US dollars; the app converts for display. */
export const CURRENCIES = [
  { code: 'USD', name: 'US dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British pound' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'AUD', name: 'Australian dollar' },
  { code: 'JPY', name: 'Japanese yen' },
  { code: 'INR', name: 'Indian rupee' },
  { code: 'CHF', name: 'Swiss franc' },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]['code'];

export const isCurrency = (x: unknown): x is CurrencyCode => CURRENCIES.some((c) => c.code === x);

/**
 * USD → other-currency rates, worked out from CoinGecko's total market cap,
 * which it reports in many currencies (e.g. EUR total ÷ USD total). This
 * costs no extra API calls.
 */
export function fxFromMarketCaps(totals: Record<string, number>): Record<string, number> {
  const usd = totals.usd;
  const out: Record<string, number> = {};
  if (!(usd > 0)) return out;
  for (const { code } of CURRENCIES) {
    if (code === 'USD') continue;
    const rate = totals[code.toLowerCase()] / usd;
    if (Number.isFinite(rate) && rate > 0) out[code] = rate;
  }
  return out;
}
