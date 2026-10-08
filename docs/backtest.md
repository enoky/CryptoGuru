<!-- Copied from .github/workflows/backtest.yml run 37781783603 (commit 95281ba). Later runs publish to their run summary. -->
# Signal backtest: all rated coins

Run 2026-10-08 · 63 coins · 2024-07-30 to 2026-09-30 · older half before 2025-10-11, newer half from then on.

Every coin-day replays the rules on data up to that day only. **Right** is how often the price then moved the way a bullish or bearish call leaned. **Spread** is the average return after bullish calls minus after bearish calls: above 0 means the calls told better days from worse ones, which the hit rate alone can’t show in a market that mostly rose or fell. The rules were written before this test was first run; any later tuning may only look at the older half, so the newer half stays a fair test.

## Next 7 days, older half

| Rules | Calls (share of days) | Right | Avg after bullish | Avg after bearish | Spread |
|---|---|---|---|---|---|
| Current rules (Phase 4) | 14,168 (73.1%) | 46.0% | −0.04% | +2.20% | −2.24 pts |
| Rules before Phase 4 | 16,615 (85.7%) | 46.1% | −0.58% | +2.14% | −2.72 pts |
| 90-day momentum | 19,380 (100.0%) | 49.2% | +1.25% | +0.96% | +0.29 pts |
| Always bullish | 19,388 (100.0%) | 47.8% | +1.11% | — | — |

## Next 7 days, newer half

| Rules | Calls (share of days) | Right | Avg after bullish | Avg after bearish | Spread |
|---|---|---|---|---|---|
| Current rules (Phase 4) | 15,688 (80.6%) | 53.6% | +2.69% | +0.61% | +2.08 pts |
| Rules before Phase 4 | 16,220 (83.3%) | 54.3% | +2.52% | +0.37% | +2.15 pts |
| 90-day momentum | 19,460 (99.9%) | 53.5% | +2.08% | +0.39% | +1.69 pts |
| Always bullish | 19,470 (100.0%) | 45.0% | +0.85% | — | — |

## Next 30 days, older half

| Rules | Calls (share of days) | Right | Avg after bullish | Avg after bearish | Spread |
|---|---|---|---|---|---|
| Current rules (Phase 4) | 14,168 (73.1%) | 38.5% | −3.53% | +12.21% | −15.75 pts |
| Rules before Phase 4 | 16,615 (85.7%) | 38.7% | −3.04% | +12.30% | −15.35 pts |
| 90-day momentum | 19,380 (100.0%) | 42.8% | +1.31% | +9.69% | −8.38 pts |
| Always bullish | 19,388 (100.0%) | 46.3% | +5.42% | — | — |

## Next 30 days, newer half

| Rules | Calls (share of days) | Right | Avg after bullish | Avg after bearish | Spread |
|---|---|---|---|---|---|
| Current rules (Phase 4) | 14,659 (81.1%) | 55.6% | +15.81% | +1.38% | +14.42 pts |
| Rules before Phase 4 | 15,026 (83.1%) | 56.5% | +14.55% | +1.30% | +13.25 pts |
| 90-day momentum | 18,063 (100.0%) | 54.0% | +10.00% | +1.60% | +8.39 pts |
| Always bullish | 18,071 (100.0%) | 44.0% | +3.49% | — | — |

## Were ratings right more often when the checks agreed? (current rules)

| Agreement | 7d older | 7d newer | 30d older | 30d newer |
|---|---|---|---|---|
| High | 45.5% (929) | 46.0% (698) | 43.8% (929) | 58.0% (602) |
| Medium | 47.0% (7,565) | 52.0% (6,300) | 38.5% (7,565) | 56.4% (5,691) |
| Low | 44.8% (5,674) | 55.4% (8,690) | 37.7% (5,674) | 55.0% (8,366) |

Right = share of bullish or bearish ratings the price then agreed with (number of coin-days in brackets). If agreement helped, High would beat Low.

## Each check (current rules, next 30 days)

| Check | When bullish: rose (older / newer) | When bearish: fell (older / newer) |
|---|---|---|
| Trend | 30.6% / 51.0% | 41.3% / 55.8% |
| Strength vs Bitcoin | 34.0% / 54.4% | 45.7% / 55.1% |
| RSI (14 days) | 41.7% / 57.1% | 56.6% / 58.3% |
| Trading volume | 48.2% / 50.7% | 58.5% / 61.5% |

Yardstick (any day, next 30 days): rose 46.3% / 44.0%; fell 53.7% / 56.0% (flat days count as neither).

## Caveats

- Neighbouring days overlap (their windows share most days), and the coins move together, so there are far fewer independent results than the counts suggest.
- Coins are today’s top 100: ones that collapsed and dropped out aren’t included, which flatters bullish calls.
- Past liquidity isn’t available. Market breadth is measured over these coins.
- No trading costs, taxes or slippage. Not financial advice.
- Pegged (price barely moves), not rated or tested: USDGO.
- Left out (no exchange history, or too little of it): Figure Heloc, Hyperliquid, LEO Token, Rain, Gram (prev. Toncoin), Bitway, OKB, MemeCore, Spiko Amundi Overnight Swap Fund (EUR), United Stables, HTX DAO, Gate, KuCoin, Blockchain Capital, Lighter, Invesco Short Duration US Government Securities Fund, Aerodrome Finance, Open USD.
