<!-- Copied from .github/workflows/backtest.yml run 37817516817 (commit b0a0e77), the Phase 5 long-history run. Later runs publish to their run summary. Rule names updated to the uptrend/downtrend wording. -->
# Signal backtest: all rated coins

Run 2026-10-08 · 50 coins · 2018-03-04 to 2026-09-30 · tuning years 2018–2022, held-out years 2023–2026.

Every coin-day replays the rules on data up to that day only. **Spread** is the average return after uptrend calls minus after downtrend calls, in percentage points: above 0 means the calls told better periods from worse ones. It is averaged **year by year**, so each market counts equally. **Against the market** measures each return minus the average of all coins that day, which removes the whole market rising or falling. Candidate settings (choppy-market filter, stricter bands, ranking) were picked on the tuning years only; the held-out years are the test.

## Up or down? Next 7 days

| Rules | Spread, tuning years | Spread, held-out years | Held-out years positive | Right, held-out | Calls, held-out |
|---|---|---|---|---|---|
| Current rules | −2.74 | −0.06 | 3 of 4 | 49.4% | 74.3% of days |
| Rules before Phase 4 | −2.12 | −0.17 | 2 of 4 | 49.6% | 84.6% of days |
| 90-day momentum | −0.80 | +0.85 | 3 of 4 | 51.2% | 99.9% of days |
| Current, neutral when Bitcoin's efficiency < 0.1 | −3.21 | +0.57 | 3 of 4 | 50.7% | 49.2% of days |
| Current, uptrend/downtrend only beyond ±40 | −2.54 | −0.08 | 2 of 4 | 48.2% | 25.5% of days |
| Always up | — | — | — | 47.6% | 100.0% of days |

## Up or down? Next 30 days

| Rules | Spread, tuning years | Spread, held-out years | Held-out years positive | Right, held-out | Calls, held-out |
|---|---|---|---|---|---|
| Current rules | −8.12 | −2.04 | 2 of 4 | 48.4% | 74.4% of days |
| Rules before Phase 4 | −7.20 | −2.69 | 1 of 4 | 47.4% | 84.6% of days |
| 90-day momentum | −2.56 | −1.79 | 1 of 4 | 49.0% | 99.9% of days |
| Current, neutral when Bitcoin's efficiency < 0.1 | −8.22 | −1.05 | 2 of 4 | 50.6% | 48.7% of days |
| Current, uptrend/downtrend only beyond ±40 | −5.83 | −2.50 | 2 of 4 | 47.7% | 25.5% of days |
| Always up | — | — | — | 46.0% | 100.0% of days |

## Against the market, next 30 days

| Rules | Spread vs market, tuning | Spread vs market, held-out | Held-out years positive | Up calls beat the market (held-out) | Down calls lagged it (held-out) |
|---|---|---|---|---|---|
| Any coin (yardstick) | — | — | — | 37.8% | 62.2% |
| Current rules | +0.17 | +0.42 | 2 of 4 | 40.0% | 62.5% |
| Rules before Phase 4 | +0.13 | +0.19 | 3 of 4 | 39.0% | 63.0% |
| 90-day momentum | +0.43 | −1.03 | 1 of 4 | 38.0% | 62.4% |
| Current, neutral when Bitcoin's efficiency < 0.1 | +0.26 | +0.49 | 3 of 4 | 40.7% | 62.6% |
| Current, uptrend/downtrend only beyond ±40 | +1.62 | +1.01 | 3 of 4 | 41.9% | 60.8% |
| Top/bottom fifth by score | +1.37 | +0.22 | 2 of 4 | 42.5% | 64.0% |
| Top/bottom fifth by 7-day return | +1.21 | +2.51 | 3 of 4 | 40.4% | 63.0% |
| Top/bottom fifth by 30-day return | +1.21 | +0.58 | 2 of 4 | 40.9% | 62.1% |
| Top/bottom fifth by 90-day return (picked) | +2.93 | −0.89 | 1 of 4 | 40.8% | 63.0% |

## Year by year: spread, next 30 days

| Year | Current rules | Rules before Phase 4 | 90-day momentum | Current, neutral when Bitcoin's efficiency < 0.1 | Current, uptrend/downtrend only beyond ±40 | Top/bottom fifth by 90-day return | Average coin |
|---|---|---|---|---|---|---|---|
| 2018 | — | — | — | — | — | — | — |
| 2019 | +0.56 | −6.30 | +2.73 | +0.90 | +2.13 | +1.32 | +4.77% |
| 2020 | −20.94 | −13.61 | −9.93 | −24.95 | −23.93 | −0.12 | +15.58% |
| 2021 | −5.58 | −1.44 | +3.86 | −3.29 | +6.09 | +11.92 | +16.35% |
| 2022 | −6.51 | −7.45 | −6.90 | −5.53 | −7.62 | −1.41 | −5.12% |
| 2023 (held-out) | +1.34 | −2.12 | −1.13 | +2.61 | +4.72 | +6.22 | +6.56% |
| 2024 (held-out) | −3.98 | −6.32 | +0.63 | −9.40 | −3.25 | −4.65 | +10.41% |
| 2025 (held-out) | −11.81 | −9.08 | −5.26 | −6.17 | −17.85 | −2.48 | −2.45% |
| 2026 (held-out) | +6.31 | +6.77 | −1.38 | +8.78 | +6.39 | −2.67 | +2.53% |

A year shows — when fewer than 10 of today's coins had 200 days of Binance history, so there's no market average to score against. The ranking column (Top/bottom fifth by 90-day return) is measured against the market; the others up or down.

## By market phase: spread, next 30 days

| Rules | Tuning, Bitcoin above its 200-day | Tuning, below | Held-out, above | Held-out, below |
|---|---|---|---|---|
| Current rules | +3.88 | −4.85 | −3.52 | −0.88 |
| Rules before Phase 4 | +7.66 | −4.28 | −4.39 | −1.22 |
| 90-day momentum | +10.98 | −4.83 | −0.29 | −3.86 |
| Current, neutral when Bitcoin's efficiency < 0.1 | +1.30 | −4.43 | −3.02 | −0.14 |
| Current, uptrend/downtrend only beyond ±40 | +5.93 | −2.74 | −4.44 | −4.02 |

Pooled within each phase (not year by year).

## Candidate settings (picked on the tuning years)

| Candidate | Spread, tuning years | Spread, held-out years |
|---|---|---|
| Current, neutral when Bitcoin's efficiency < 0.1 **(picked)** | −8.22 | −1.05 |
| Current, neutral when Bitcoin's efficiency < 0.15 | −8.34 | −0.76 |
| Current, neutral when Bitcoin's efficiency < 0.2 | −8.75 | −0.88 |
| Current, neutral when Bitcoin's efficiency < 0.25 | −9.36 | +0.66 |
| Current, neutral when Bitcoin's efficiency < 0.3 | −8.96 | +0.63 |
| Current, uptrend/downtrend only beyond ±25 | −8.57 | −1.92 |
| Current, uptrend/downtrend only beyond ±30 | −9.40 | −2.07 |
| Current, uptrend/downtrend only beyond ±40 **(picked)** | −5.83 | −2.50 |
| Top/bottom fifth by score (vs market) | +1.37 | +0.22 |
| Top/bottom fifth by 7-day return (vs market) | +1.21 | +2.51 |
| Top/bottom fifth by 30-day return (vs market) | +1.21 | +0.58 |
| Top/bottom fifth by 90-day return (vs market) **(picked)** | +2.93 | −0.89 |

## Were ratings right more often when the checks agreed? (current rules, next 30 days)

| Agreement | Tuning years | Held-out years |
|---|---|---|
| High | 46.1% (1,056) | 44.8% (2,268) |
| Medium | 47.5% (9,060) | 48.9% (18,441) |
| Low | 52.3% (13,466) | 48.3% (19,012) |

## Each check (current rules, held-out years, next 30 days)

| Check | When up: beat the market | When down: lagged it |
|---|---|---|
| Trend | 39.6% | 62.4% |
| Strength vs Bitcoin | 40.1% | 61.6% |
| RSI (14 days) | 49.3% | 62.1% |
| Trading volume | 35.3% | 61.6% |

The yardstick: any coin beat the market average 37.8% of the time and lagged it 62.2% (a few big winners pull the average up).

## Caveats

- Neighbouring days overlap (their windows share most days), and the coins move together, so there are far fewer independent results than the counts suggest; a single year is a handful of market moves.
- Coins are today’s top 100: ones that collapsed and dropped out aren’t included, which flatters uptrend calls, more so in the early years.
- Early years have fewer coins (Binance listings), so market averages and rankings there are rougher.
- Past liquidity isn’t available. Market breadth is measured over these coins.
- No trading costs, taxes or slippage. Not financial advice.
- Left out (no Binance history, or too little of it): Figure Heloc, Hyperliquid, Monero, WhiteBIT Coin, LEO Token, Rain, Canton, Gram (prev. Toncoin), Bitway, Cronos, OKB, MemeCore, Mantle, Spiko Amundi Overnight Swap Fund (EUR), United Stables, HTX DAO, Bitget Token, USDGO, Gate, Venice Token, KuCoin, Kaspa, Blockchain Capital, Pi Network, Lighter, Invesco Short Duration US Government Securities Fund, Aerodrome Finance, Open USD, Stable, Akedo, Spiko EU T-Bills Money Market Fund, XDC Network.
