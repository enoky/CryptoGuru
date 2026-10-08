<!-- First run of .github/workflows/backtest.yml (run 37778895840, commit 0705539). Later runs publish to their run summary. -->
# Signal backtest: all rated coins

Run 2026-10-08 · 64 coins · 2024-07-30 to 2026-09-30 · older half before 2025-10-10, newer half from then on.

Every coin-day replays the rules on data up to that day only. **Right** is how often the price then moved the way a bullish or bearish call leaned. **Spread** is the average return after bullish calls minus after bearish calls: above 0 means the calls told better days from worse ones, which the hit rate alone can’t show in a market that mostly rose or fell. The rules were written before this test was first run; any later tuning may only look at the older half, so the newer half stays a fair test.

## Next 7 days, older half

| Rules | Calls (share of days) | Right | Avg after bullish | Avg after bearish | Spread |
|---|---|---|---|---|---|
| Current rules (Phase 4) | 14,408 (72.9%) | 46.2% | +0.00% | +2.20% | −2.20 pts |
| Rules before Phase 4 | 16,989 (85.9%) | 46.6% | −0.49% | +2.15% | −2.65 pts |
| 90-day momentum | 19,766 (100.0%) | 49.5% | +1.24% | +0.97% | +0.27 pts |
| Always bullish | 19,775 (100.0%) | 48.3% | +1.11% | — | — |

## Next 7 days, newer half

| Rules | Calls (share of days) | Right | Avg after bullish | Avg after bearish | Spread |
|---|---|---|---|---|---|
| Current rules (Phase 4) | 15,987 (80.4%) | 53.7% | +2.57% | +0.61% | +1.96 pts |
| Rules before Phase 4 | 16,580 (83.4%) | 54.3% | +2.39% | +0.36% | +2.03 pts |
| 90-day momentum | 19,866 (99.9%) | 53.5% | +1.99% | +0.39% | +1.60 pts |
| Always bullish | 19,876 (100.0%) | 45.1% | +0.83% | — | — |

## Next 30 days, older half

| Rules | Calls (share of days) | Right | Avg after bullish | Avg after bearish | Spread |
|---|---|---|---|---|---|
| Current rules (Phase 4) | 14,408 (72.9%) | 39.0% | −3.31% | +12.19% | −15.50 pts |
| Rules before Phase 4 | 16,989 (85.9%) | 39.6% | −2.69% | +12.31% | −15.00 pts |
| 90-day momentum | 19,766 (100.0%) | 43.4% | +1.37% | +9.69% | −8.31 pts |
| Always bullish | 19,775 (100.0%) | 47.0% | +5.37% | — | — |

## Next 30 days, newer half

| Rules | Calls (share of days) | Right | Avg after bullish | Avg after bearish | Spread |
|---|---|---|---|---|---|
| Current rules (Phase 4) | 14,950 (81.0%) | 55.7% | +14.91% | +1.40% | +13.51 pts |
| Rules before Phase 4 | 15,366 (83.3%) | 56.5% | +13.69% | +1.31% | +12.38 pts |
| 90-day momentum | 18,446 (100.0%) | 54.1% | +9.61% | +1.59% | +8.02 pts |
| Always bullish | 18,454 (100.0%) | 44.1% | +3.45% | — | — |

## Does confidence mean anything? (current rules)

| Confidence | 7d older | 7d newer | 30d older | 30d newer |
|---|---|---|---|---|
| High | 43.8% (5,192) | 54.4% (4,007) | 34.8% (5,192) | 55.0% (3,659) |
| Medium | 47.7% (6,681) | 54.2% (7,393) | 42.3% (6,681) | 55.4% (6,771) |
| Low | 47.1% (2,535) | 52.3% (4,587) | 38.5% (2,535) | 56.7% (4,520) |

Right = share of bullish or bearish ratings the price then agreed with (number of coin-days in brackets). High should beat Low.

## Each check (current rules, next 30 days)

| Check | When bullish: rose (older / newer) | When bearish: fell (older / newer) |
|---|---|---|
| Trend | 32.5% / 51.7% | 41.3% / 55.8% |
| Strength vs Bitcoin | 35.6% / 55.2% | 45.2% / 55.5% |
| RSI (14 days) | 50.0% / 73.3% | 56.6% / 59.0% |
| Trading volume | 48.8% / 50.8% | 57.3% / 60.8% |

Yardstick (any day, next 30 days): rose 47.0% / 44.1%; fell 53.0% / 55.9% (flat days count as neither).

## Caveats

- Neighbouring days overlap (their windows share most days), and the coins move together, so there are far fewer independent results than the counts suggest.
- Coins are today’s top 100: ones that collapsed and dropped out aren’t included, which flatters bullish calls.
- Past liquidity isn’t available, so it never lowers confidence here. Market breadth is measured over these coins.
- No trading costs, taxes or slippage. Not financial advice.
- Left out (no exchange history, or too little of it): Figure Heloc, Hyperliquid, LEO Token, Rain, Gram (prev. Toncoin), Bitway, Tether Gold, OKB, MemeCore, Circle USYC, Ondo US Dollar Yield, BlackRock USD Institutional Digital Liquidity Fund, Spiko Amundi Overnight Swap Fund (EUR), United Stables, HTX DAO, USDGO, Gate, KuCoin, Blockchain Capital, Lighter, Invesco Short Duration US Government Securities Fund, Aerodrome Finance, Open USD, GHO.
