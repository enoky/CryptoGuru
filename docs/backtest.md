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

## Futures funding (Phase 5, Step 5), next 30 days

From run 37825754453 (commit 8e278b6): same coins and years, plus Binance's funding-rate archive. Funding is the 7-day average rate perpetual-futures longs paid shorts (per 8 hours). Coin-days with funding data: 73.9% of tuning, 91.0% of held-out; the filter rules fall back to the current rules elsewhere.

| Rules | Spread, tuning | Spread, held-out | Held-out years positive | Spread vs market, held-out | Calls, held-out |
|---|---|---|---|---|---|
| Current rules | −8.12 | −1.87 | 2 of 4 | +0.48 | 74.6% of days |
| Funding against the crowd, above 0.02% / below 0.00% | +1.47 | +9.99 | 2 of 2 | −1.69 | 29.8% of days |
| Funding against the crowd, above 0.03% / below 0.00% | +3.44 | +15.59 | 2 of 2 | −1.26 | 27.7% of days |
| Funding against the crowd, above 0.05% / below 0.00% **(picked)** | +4.37 | +16.92 | 2 of 2 | −0.15 | 25.9% of days |
| Funding against the crowd, above 0.03% / below −0.01% | −0.37 | +14.70 | 2 of 2 | −2.20 | 9.6% of days |
| Current, neutral when funding is crowded the same way (above 0.02% / below 0.00%) | −8.71 | −0.23 | 3 of 4 | +0.79 | 58.3% of days |
| Current, neutral when funding is crowded the same way (above 0.03% / below 0.00%) | −8.63 | −0.63 | 2 of 4 | +0.74 | 59.7% of days |
| Current, neutral when funding is crowded the same way (above 0.05% / below 0.00%) **(picked)** | −8.21 | −1.15 | 2 of 4 | +0.73 | 60.9% of days |
| Current, neutral when funding is crowded the same way (above 0.03% / below −0.01%) | −9.14 | −1.05 | 2 of 4 | +0.45 | 69.8% of days |

### Funding, year by year (next 30 days)

| Year | Funding against the crowd (picked): up calls / down calls / spread | Funding filter (picked): up calls / down calls / spread |
|---|---|---|
| 2018 | — | — |
| 2019 | — | 912 / 1,814 / +0.56 |
| 2020 | 617 / 671 / +37.18 | 2,372 / 1,495 / −16.85 |
| 2021 | 655 / 1,704 / −28.43 | 3,630 / 1,755 / −12.18 |
| 2022 | 3,610 / 0 / — | 844 / 6,030 / −4.37 |
| 2023 (held-out) | 2,226 / 6 / +15.09 | 3,007 / 4,668 / +2.64 |
| 2024 (held-out) | 1,366 / 400 / +18.75 | 5,527 / 4,222 / −3.36 |
| 2025 (held-out) | 4,398 / 0 / — | 3,950 / 5,018 / −11.35 |
| 2026 (held-out) | 4,485 / 0 / — | 1,585 / 5,279 / +7.46 |

A spread needs both up and down calls in the year; with only one kind it shows —. The picked "against the crowd" rule's held-out average rests on two years, one of them on 6 coin-days of down calls, and its tuning years swung from +37 to −28: not enough to trust, so it isn't shipped.

---

<!-- Copied from .github/workflows/backtest.yml run 37834478061 (commit 17f0d31), the Phase 6 run. Its main tables match the run above to within a few coin-days (data up to the end of September 2026). -->

## Learned weights (Phase 6)

Logistic regression fitted on the tuning years only (up to 2022), on the same four readings, to predict whether a coin rose over the next 30 days (or beat the average coin). The weights are shown as signed shares; a negative weight means that reading pointed the wrong way in the tuning years. The learned rules then score coins exactly like the live ones (±15 bands) and are judged on the held-out years.

| Check | Live weights | Learned (up or down) | Learned (against the market) |
|---|---|---|---|
| Trend | 45% | 25% | −20% |
| Strength vs Bitcoin | 25% | −56% | 43% |
| RSI (14 days) | 15% | −3% | 11% |
| Trading volume | 15% | 16% | −25% |

| Rules | Judged on | Spread, tuning (avg of years) | Spread, held-out (avg of years) | Held-out years positive | Held-out pooled [90% range] | Difference from current rules, held-out [90% range] |
|---|---|---|---|---|---|---|
| Current rules | up or down | −8.12 | −2.06 | 2 of 4 | −1.66 [−7.36 to +4.59] | — |
| 90-day momentum | up or down | −2.56 | −1.91 | 1 of 4 | −0.52 [−6.43 to +5.38] | −2.76 to +5.37 |
| Learned weights (up or down) | up or down | +2.63 | +3.30 | 3 of 4 | +2.33 [−3.05 to +8.73] | −1.93 to +10.72 |
| Learned weights (against the market) | against the market | +0.14 | −1.28 | 1 of 4 | −1.13 [−3.95 to +1.57] | −3.37 to +0.91 |

A difference range that includes 0 means the result could be chance. The ranges come from resampling whole months 1,000 times, so days that overlap and coins that move together count once, not many times.

## Which checks matter? (ablation, next 30 days)

The current rules with one check left out (its weight set to 0, the others rescaled). If leaving a check out makes the spread better, that check was hurting.

| Rules | Judged on | Spread, tuning (avg of years) | Spread, held-out (avg of years) | Held-out years positive | Held-out pooled [90% range] | Difference from current rules, held-out [90% range] |
|---|---|---|---|---|---|---|
| Current rules | up or down | −8.12 | −2.06 | 2 of 4 | −1.66 [−7.36 to +4.59] | — |
| Current rules without Trend | up or down | −3.83 | +0.09 | 3 of 4 | −0.27 [−4.42 to +3.70] | −4.83 to +6.68 |
| Current rules without Strength vs Bitcoin | up or down | −8.20 | −2.70 | 1 of 4 | −2.05 [−8.36 to +4.84] | −1.57 to +0.81 |
| Current rules without RSI (14 days) | up or down | −7.71 | −2.17 | 2 of 4 | −1.76 [−7.39 to +4.45] | −0.30 to +0.11 |
| Current rules without Trading volume | up or down | −8.52 | −2.94 | 2 of 4 | −2.80 [−8.68 to +3.35] | −1.90 to −0.44 |

## Ratings in detail, tuning years (next 30 days)

| Rating | Coin-days | Higher after 30 days | Average [90% range] | Median | Average when it rose | Average when it fell | Worst |
|---|---|---|---|---|---|---|---|
| Strong uptrend | 2,694 | 46.9% | +13.1% [−3.4% to +27.4%] | −3.0% | +56.7% | −25.3% | −70% |
| Uptrend | 6,889 | 46.8% | +8.5% [−1.2% to +19.7%] | −2.4% | +42.5% | −21.3% | −70% |
| No clear trend | 7,812 | 48.7% | +7.4% [+0.6% to +15.9%] | −1.0% | +35.0% | −18.7% | −66% |
| Downtrend | 12,926 | 47.2% | +4.5% [−2.0% to +11.8%] | −1.6% | +30.6% | −18.8% | −68% |
| Strong downtrend | 1,073 | 49.4% | +4.4% [−4.1% to +16.3%] | −0.2% | +29.1% | −19.7% | −58% |
| **Any coin-day (yardstick)** | 31,394 | 47.5% | +6.9% [+0.4% to +13.9%] | −1.6% | +36.4% | −19.9% | −70% |

## Ratings in detail, held-out years (next 30 days)

| Rating | Coin-days | Higher after 30 days | Average [90% range] | Median | Average when it rose | Average when it fell | Worst |
|---|---|---|---|---|---|---|---|
| Strong uptrend | 3,411 | 45.2% | +4.1% [−1.6% to +10.2%] | −3.4% | +32.2% | −19.1% | −59% |
| Uptrend | 11,010 | 42.9% | +2.7% [−3.0% to +9.0%] | −3.5% | +28.4% | −16.6% | −62% |
| No clear trend | 13,993 | 43.1% | +3.3% [−1.3% to +8.9%] | −3.2% | +27.5% | −15.0% | −63% |
| Downtrend | 23,511 | 48.3% | +4.2% [+0.1% to +9.0%] | −0.6% | +23.1% | −13.6% | −57% |
| Strong downtrend | 2,928 | 50.9% | +9.0% [+1.9% to +19.0%] | +0.4% | +31.8% | −14.6% | −53% |
| **Any coin-day (yardstick)** | 54,853 | 45.8% | +3.9% [−0.3% to +8.7%] | −1.9% | +26.2% | −15.0% | −63% |

Compare each rating with the yardstick row: a rating only tells you something if it differs from any coin-day by more than its range.

---

<!-- Copied from .github/workflows/backtest.yml run 37838827221 (commit 5eb9b97), the Phase 7 run. The current rules' held-out spread (−1.90) differs slightly from the Phase 6 run (−2.06) because the top-100 list and the latest days of data changed between runs. -->

## Volume variants (Phase 7, Step 2), next 30 days

Each variant replaces only the volume reading in the current rules; everything else is unchanged. The variant with the best spread on the tuning years (up to 2022) is picked before looking at the held-out years.

| Rules | Judged on | Spread, tuning (avg of years) | Spread, held-out (avg of years) | Held-out years positive | Held-out pooled [90% range] | Difference from current rules, held-out [90% range] |
|---|---|---|---|---|---|---|
| Current rules | up or down | −8.12 | −1.90 | 2 of 4 | −1.45 [−7.25 to +4.92] | — |
| 90-day momentum | up or down | −2.56 | −1.80 | 1 of 4 | −0.34 [−6.26 to +5.69] | −2.78 to +5.25 |
| Volume as now (7d ÷ 30d above 1.3 → direction of the 7-day move) | up or down | −8.12 | −1.90 | 2 of 4 | −1.45 [−7.25 to +4.92] | +0.00 to +0.00 |
| Graded volume ((ratio − 1) ÷ 0.6, capped) | up or down | −8.11 | −1.81 | 2 of 4 | −1.34 [−7.18 to +5.05] | −0.06 to +0.29 |
| Volume surprise (80th percentile of 180 days) ← picked | up or down | −7.75 | −1.72 | 2 of 4 | −1.36 [−7.14 to +4.74] | −0.38 to +0.50 |
| Volume surprise (90th percentile of 180 days) | up or down | −7.89 | −2.12 | 2 of 4 | −1.77 [−7.61 to +4.41] | −0.73 to +0.04 |
| Accumulation / distribution | up or down | −7.92 | −1.57 | 2 of 4 | −1.06 [−6.87 to +5.29] | +0.18 to +0.58 |

Picked variant: **Fails**: positive in only 2 of 4 held-out years; the range of its difference from the current rules includes 0.

## Stablecoin supply (Phase 7, Step 3), next 30 days

Total stablecoin supply from DefiLlama (3,236 days). Market timing gives every coin the same call on a day, so its spread is the next-30-day return on days supply grew minus days it shrank. The fifth check adds the 30-day change ÷ 3% (capped at ±1) to the current rules at weight 15.

| Rules | Judged on | Spread, tuning (avg of years) | Spread, held-out (avg of years) | Held-out years positive | Held-out pooled [90% range] | Difference from current rules, held-out [90% range] |
|---|---|---|---|---|---|---|
| Current rules | up or down | −8.12 | −1.90 | 2 of 4 | −1.45 [−7.25 to +4.92] | — |
| 90-day momentum | up or down | −2.56 | −1.80 | 1 of 4 | −0.34 [−6.26 to +5.69] | −2.78 to +5.25 |
| Stablecoin supply as market timing (±0% over 30 days) ← picked | up or down | +6.20 | −11.52 | 2 of 4 | +0.43 [−6.13 to +7.29] | −4.78 to +9.12 |
| Stablecoin supply as market timing (±1% over 30 days) | up or down | +1.67 | +8.92 | 2 of 3 | +0.86 [−6.62 to +8.36] | −5.53 to +10.26 |
| Stablecoin supply as market timing (±2% over 30 days) | up or down | +1.99 | +6.14 | 1 of 2 | −1.65 [−12.65 to +9.67] | −10.22 to +10.63 |
| Current rules + stablecoin supply as a fifth check (weight 15) | up or down | −9.01 | −2.01 | 2 of 4 | −2.38 [−9.00 to +4.64] | −2.60 to +0.78 |

Market timing, picked level: **Fails**: not above the current rules; not above 90-day momentum; positive in only 2 of 4 held-out years; the range of its difference from the current rules includes 0.

Fifth check: **Fails**: not above the current rules; not above 90-day momentum; positive in only 2 of 4 held-out years; the range of its difference from the current rules includes 0.

Acceptance: on the held-out years, a higher spread than the current rules and 90-day momentum, positive in most years, and a 90% range for the difference from the current rules that excludes 0.
