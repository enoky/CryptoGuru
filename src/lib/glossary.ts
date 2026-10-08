export const GLOSSARY = {
  marketCap: {
    title: 'Market cap',
    text: 'The total value of all coins in circulation: price × circulating supply. It is the usual way to rank how big a coin is.',
  },
  volume: {
    title: '24h volume',
    text: 'How much of the coin was traded in the last 24 hours, in US dollars. Higher volume usually means it is easier to buy or sell without moving the price.',
  },
  circulating: {
    title: 'Circulating supply',
    text: 'How many coins are currently available to the public. Coins that are locked or not yet released are not counted.',
  },
  maxSupply: {
    title: 'Max supply',
    text: 'The most coins that can ever exist. Some coins have no maximum, which means new coins can keep being created.',
  },
  ath: {
    title: 'All-time high',
    text: 'The highest price the coin has ever traded at, and how far today’s price is below it.',
  },
  volatility: {
    title: 'Volatility (30 days)',
    text: 'How much the price has been swinging day to day over the last 30 days, scaled to a yearly figure. Under 40% is low for crypto; over 80% is high, meaning big moves in either direction are common.',
  },
  dominance: {
    title: 'BTC dominance',
    text: 'Bitcoin’s share of the total crypto market cap. When it rises, money is usually moving into Bitcoin from other coins; when it falls, the reverse.',
  },
  fearGreed: {
    title: 'Fear & Greed Index',
    text: 'A 0–100 score of overall crypto market mood, built from price swings, momentum, social media and other inputs. Low means fear, high means greed. Some traders treat extreme readings as a sign the market may turn.',
  },
  totalCap: {
    title: 'Total market cap',
    text: 'The combined market cap of all crypto assets, and how much it changed in the last 24 hours.',
  },
} as const;

export type Term = keyof typeof GLOSSARY;
