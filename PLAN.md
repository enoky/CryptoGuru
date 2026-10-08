# CryptoGuru — Implementation Plan

> Produced from [`PROMPT.md`](./PROMPT.md). Items marked **⚠ verify before build** depend on free-tier limits or API terms that change often; check them against the provider's current docs before writing code.

**One-line summary:** a static Svelte single-page app served by one Cloudflare Worker (using Workers static assets), which also that caches CoinGecko and Binance public data for all users. In the browser, the app computes transparent technical-indicator signals and explains each one in plain English. Running cost is $0; there are no user accounts and no tracking.

---

## 1. Data sources

| Source | Key endpoints | Free limits | CORS | Terms / attribution | Powers |
|---|---|---|---|---|---|
| **CoinGecko** (Demo plan, free key, no card) | `/coins/markets`, `/coins/{id}/market_chart`, `/global`, `/search/trending`, `/coins/{id}` | ~30 calls/min, **10k calls/month** ⚠ verify before build | Yes | "Data provided by CoinGecko" link required | Rankings, market cap, supply, ATH, global stats, trending, coin metadata |
| **Binance public market data** (`data-api.binance.vision`) | `/api/v3/ticker/24hr`, `/api/v3/klines` | Weight-based, ~6000 weight/min per IP ⚠ | Yes | Public market data; `api.binance.com` blocks US IPs (HTTP 451), so use the `data-api.binance.vision` mirror ⚠ | Live prices, 24h volume, OHLC candles for charts and indicators |
| **CoinPaprika** | `/v1/tickers`, `/v1/global`, `/v1/coins/{id}/ohlcv/historical` | Keyless, ~20k calls/month; free plan's history is limited ⚠ | Yes | Attribution requested | Fallback for markets and global stats |
| **Kraken public** | `/0/public/OHLC`, `/0/public/Ticker` | ~1 req/s per IP | Yes | Public | Fallback for candles of major coins |
| **Alternative.me** | `api.alternative.me/fng/?limit=30` | Keyless, generous | Yes | Attribution link required | Fear & Greed index |

**Primary and fallback for each data type**

| Data type | Primary | Fallback 1 | Fallback 2 |
|---|---|---|---|
| Top-50 list, market cap, supply, ATH | CoinGecko `/coins/markets` | CoinPaprika `/v1/tickers` | Last good snapshot in KV |
| Live price and 24h change | Binance `ticker/24hr` | CoinGecko snapshot | CoinPaprika |
| Daily candles (1y) | Binance `klines?interval=1d&limit=365` | CoinGecko `market_chart?days=365` | Kraken OHLC |
| Hourly candles (7d) | Binance `klines?interval=1h&limit=168` | CoinGecko `market_chart?days=7` | — |
| Global stats (total cap, BTC dominance) | CoinGecko `/global` | CoinPaprika `/v1/global` | Last good snapshot |
| Trending coins | CoinGecko `/search/trending` | Hide the widget | — |
| Fear & Greed | Alternative.me | Hide the widget, with a note | — |
| News (optional, post-MVP) | **Not included (checked in Phase 3):** CryptoPanic's API terms couldn't be found; CoinDesk and Cointelegraph publish RSS feeds but license headline display commercially and their terms grant no republishing. Revisit only with written permission or a source whose terms clearly allow it. | — | — |

Stablecoins and coins without a Binance USDT pair (e.g. LEO) use the CoinGecko candle path; stablecoins and other pegged assets aren't rated (§5). The Worker maintains a `symbol → Binance pair` map built from `/api/v3/exchangeInfo` once a day.

---

## 2. Architecture

```
                ┌────────────────────── Cloudflare (free) ──────────────────────┐
 Browser  ───►  │  Pages: static SPA (HTML/JS/CSS, ~150 KB gz)                  │
  (SPA)         │                                                               │
    │           │  Worker  /api/*                                               │
    └──fetch──► │   ├─ Cron (every 10 min) ─► CoinGecko markets/global/trending │
                │   │                         Alternative.me F&G (hourly)       │
                │   │        └─ validate ─► KV "snapshot:*" (last good data)    │
                │   ├─ /api/snapshot  ◄─ KV                                     │
                │   ├─ /api/prices    ◄─ Cache API (30 s) ◄─ Binance ticker     │
                │   └─ /api/candles/:id ◄─ Cache API (1 h / 15 min) ◄─ Binance  │
                │                              │ on failure ─► CoinGecko/Kraken  │
                └───────────────────────────────────────────────────────────────┘
    Browser also keeps: IndexedDB copy of last snapshot + candles; localStorage prefs/watchlist
    If the Worker is unreachable: browser calls Binance + CoinPaprika directly (both allow CORS)
```

**Why each choice**
- **A shared Worker cache instead of each browser calling the APIs directly.** Every visitor reads the same cached data, so upstream calls grow with time rather than with traffic, and the free tiers hold up. It also keeps the CoinGecko key secret.
- **KV for snapshots, Cache API for everything else.** KV's free tier allows only ~1,000 writes/day ⚠, so it holds only the small, cron-written "last good" snapshots (~250 writes/day, see §4). High-churn data (prices, candles) goes in the Cache API, which costs no KV writes.
- **Cron pull instead of on-demand fetching for CoinGecko.** This puts a hard ceiling on CoinGecko usage regardless of traffic.
- **A direct-from-browser fallback.** If the Worker or its quota is exhausted, the app still works using keyless, CORS-enabled sources.
- **Indicators computed in the browser.** No extra server work is needed, and users can inspect the inputs.
- **One Worker serves both the app and the API** (Workers static assets) instead of Pages plus a separate Worker. It's one deploy, the API is same-origin, and the free tier is the same. *(Changed during the MVP build.)*
- **Two cache layers in the Worker:** an in-memory cache per isolate, then Cloudflare's Cache API. The Cache API does nothing on `*.workers.dev` domains ⚠, so the memory layer is what protects rate limits until a custom domain is added.

Alternative considered: a GitHub Actions cron that commits JSON to GitHub Pages. It's simpler, but schedules can be delayed by 10–60 min and each update means a commit, so it's kept only as a contingency if Cloudflare's terms change.

---

## 3. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **Svelte 5 + Vite**, TypeScript, static SPA | Smallest runtime of the mainstream options; simple reactive state |
| Routing | `svelte-spa-router` (hash routes) | Works on any static host with no rewrite rules |
| Charts | **TradingView Lightweight Charts** (~45 KB gz) | Built for financial time series; fast; supports candles and lines |
| Sparklines | Hand-written inline SVG | No library needed for 7-day mini charts |
| Styling | **Tailwind CSS** + CSS variables for themes | Tiny output after purge; easy dark/light themes |
| State | Svelte stores + a small fetch/cache layer (stale-while-revalidate) | No heavy state library needed |
| Validation | **Valibot** (~2 KB per schema) | Like Zod but much smaller; validates every API response |
| Client storage | `idb-keyval` (IndexedDB), localStorage | Offline last-good data; preferences |
| Worker | TypeScript Worker, `wrangler` | Free tier; same language as the frontend |
| Indicator maths | Own small module (no library) | Easy to test and audit; formulas are short |
| Tests | Vitest, MSW (mock APIs), Playwright | Fast unit tests; realistic API mocks; one end-to-end smoke test |

---

## 4. Robustness strategy

### Cache TTLs

| Data | Worker TTL | Browser TTL | Refresh in UI |
|---|---|---|---|
| Live prices (Binance ticker) | 30 s | 30 s | every 60 s while the tab is visible |
| Markets snapshot (CoinGecko) | cron every 10 min | 5 min | on focus / every 5 min |
| Sparklines (7-day) | cron hourly | with snapshot | with snapshot |
| Signal ratings | each coin re-rated every ~2 h, in batches of 8 every 10 min | 10 min | every 10 min while visible |
| Global stats | cron every 30 min | 15 min | every 15 min |
| Trending | cron every 2 h | 30 min | on load |
| Fear & Greed | cron every 60 min | 1 h | on load |
| Hourly candles (7d) | 15 min | 15 min | on opening an asset |
| Daily candles (1y) | 1 h | 6 h (IndexedDB) | on opening an asset |

Every layer uses **stale-while-revalidate**: return the cached value immediately and refresh it in the background. Polling pauses when the tab is hidden (`visibilitychange`).

### Request budget (per month, regardless of visitor count)

| Upstream call | Frequency | Calls/month |
|---|---|---|
| CoinGecko `/coins/markets` without sparklines | 144/day | ~4,460 |
| CoinGecko `/coins/markets` with sparklines (hourly) | 24/day | ~740 |
| CoinGecko `/global` | 48/day | ~1,490 |
| CoinGecko `/search/trending` (every 2 h) | 12/day | ~370 |
| CoinGecko candle fallbacks (charts, ≈10 non-Binance coins × 4/day) | 40/day | ~1,240 |
| CoinGecko candles for signals (coins on neither Binance nor Kraken, twice a day) | ≈20/day | ~600 |
| **CoinGecko total** | | **~8,900 / 10,000** ⚠ |
| Binance/Kraken daily candles for signals | ~8 per 10 min | free, weight-limited |
| KV writes (snapshot ≤144 + signals ≤144 per day) | ≤ ~290/day | under the 1,000/day limit ⚠ |
| Worker requests | grow with traffic | the free tier is 100k/day ⚠, enough for roughly 5–10k daily visitors |

### Free-plan limits per Worker run

Each run (a request or a cron firing) may make **50 outbound requests** and use **10 ms of CPU** (time spent waiting on the network doesn't count) ([Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/)). So:
- Two cron triggers, each with its own allowance: `*/10` refreshes the snapshot, `5-59/10` rates a batch of coins.
- Every cron run uses a request budget of 45 and stops early when fewer than 3 remain.
- Measured locally: the market list without sparklines takes ~1 ms; with sparklines ~4–5 ms (so they are fetched only hourly); a batch of 8 coins with 250 daily candles each takes ~3–7 ms.
- **Measured live (Cloudflare dashboard, Oct 7–8 2026, first day after deploying):** CPU per run P50 10.9 ms, P90 26.1 ms, P99 31.9 ms, peaks around 64 ms, so many runs go over the nominal 10 ms. The heaviest stretch was the first night, when every coin was due at once; after that, P50 settled around 3–5 ms with P90 still 15–25 ms (most likely the 8-coin signal batches). **No run was stopped:** "Exceeded CPU Time Limits" and every other error count were 0, and `/api/health` showed full batches finishing (32 coins rated four runs after a ratings reset, `stale` 0). Cloudflare allows some leeway over 10 ms on the free plan, but it isn't guaranteed.
- **Decision:** keep `BATCH` at 8. If "Exceeded CPU Time Limits" ever shows above 0, or `stale` / `lastRunSecondsAgo` (> 600) show batches not finishing, halve it to 4 and raise `SIGNAL_REFRESH_MS` to 4 hours (daily-candle signals barely change in that time). There's no CPU headroom for new work in the Worker.

If KV or Worker limits are hit, the app automatically switches to its browser-direct fallback.

### Rate-limit handling
- The Worker uses **a single request coalescer**: concurrent requests for the same key share one upstream fetch.
- **Exponential backoff with jitter** on 429/5xx (1 s, 2 s, 4 s; max 3 tries), and it respects `Retry-After`.
- A **circuit breaker** per source: after 3 consecutive failures, skip that source for 5 min and go straight to the fallback.
- Prices are fetched in **batches**: one Binance call returns all symbols, and one CoinGecko page returns the top 100.

### Failover
Each data type has an ordered source list (§1). The adapter tries them in order, maps every response to one internal type (`Asset`, `Candle[]`, `GlobalStats`), and records which source served it. The UI shows the source in the footer ("Prices: Binance · Rankings: CoinGecko").

### Graceful degradation
- The page is never blank. On load it renders the IndexedDB snapshot first, then updates it.
- Every widget shows **"Data as of HH:MM"**. It turns amber when data is older than 2× its TTL, and red with "Couldn't refresh, showing older data" when older than 6×.
- A failing widget shows a small inline error with a Retry button; the rest of the page still works.
- Offline: a service worker caches the app shell, so the app opens and shows the last saved data with an "Offline" banner.

### Validating responses
- Every upstream response passes through a Valibot schema in the Worker and again in the browser. Data that fails is **dropped and logged**, and the previous good value is kept.
- Sanity checks: a price must be greater than 0 and finite; reject any change of more than 90% in 10 minutes unless two sources agree; candles must be sorted and de-duplicated.
- Nothing upstream is rendered as HTML (text only), so a compromised API can't inject script.

---

## 5. Recommendation engine

All signals come from **daily closes (up to 365)** plus volume, with no machine learning and no price targets. An indicator is skipped, and the skip is shown, when there isn't enough history (e.g. no SMA200 for coins younger than 200 days).

### Checks (Phase 4 rules)

The score comes from four groups. Each reads from −1 (pointing down) to +1 (pointing up); distances are **graded** (0 inside a neutral band, rising in a straight line to ±1 at a "full" value) rather than just +1/0/−1. For coins more volatile than 60% a year, every band and full value is widened in proportion, up to 3× (`volScale`), so a 2% move counts for BTC but not for a coin that swings 150% a year.

| Group | Weight | How it's read |
|---|---|---|
| **Trend** | 45 | The plain average of three parts: price vs SMA200 (neutral within ±2%, full at ±20%); SMA50 vs SMA200 (±1%, full at ±10%); MACD(12,26,9) histogram (+1 if > 0 and rising 3 days, −1 if < 0 and falling 3 days, else 0). Averaged because the three measure much the same thing. Required for a rating. |
| **Strength vs Bitcoin** | 25 | Coin's 90-day return minus Bitcoin's, in percentage points: neutral within ±5, full at ±50. Not used for Bitcoin itself. |
| **RSI(14), Wilder** | 15 | Depends on the long-term trend (the price-vs-SMA200 part). RSI < 30: +1 in an uptrend or with no clear trend, 0 in a downtrend (fast falls often keep falling). RSI > 70: −1 in a downtrend or with no clear trend, 0 in an uptrend. |
| **Volume** | 15 | 7-day ÷ 30-day average volume > 1.3: ±1 in the direction of the 7-day move, else 0. |

**Market context, never scored:** Fear & Greed (the same for every coin, so it couldn't tell coins apart; under the old rules extreme fear alone tipped every neutral coin to "Leaning bullish"); **market breadth** (share of rated coins above their 200-day average); **liquidity** (24h volume ÷ market cap); distance from the all-time high; 30-day annualized volatility (`stdev(ln returns) × √365`, Low < 40%, Medium 40–80%, High > 80%).

### Where signals are computed
- **Signals screen (all coins):** the Worker rates ~90 coins (pegged assets excluded, see below) in batches of 8 per 10-minute cron run, stalest first but Bitcoin always first, from 250 daily candles each (Binance → Kraken → CoinGecko, with CoinGecko used at most twice a day per coin). Bitcoin's 90-day return and market breadth are worked out from the ratings so far and passed to every coin. Results live in KV (with a format version, so ratings in an older format are dropped and rebuilt) and are served from `/api/signals`; `/api/health` shows the market context.
- **Coin page:** shows the server's rating when it is under 3 hours old; otherwise the browser works it out from the 1-year daily candles it already downloads for the chart, using the same shared code and the server's Bitcoin return and breadth.
- The rules live in `shared/signals.ts`; the plain-English sentences in `src/lib/explain.ts`. Tests check RSI against a published worked example and MACD against a case with an exact answer.

### Combining signals
- `score = Σ(weightᵢ × readingᵢ) / Σ(weightᵢ of groups that had enough data) × 100`, giving −100 to +100. A rating needs the trend group plus at least one other.
- **Overall rating:**

  | Score | Label shown |
  |---|---|
  | ≥ 50 | Strong uptrend |
  | 15 to 49 | Uptrend |
  | −14 to 14 | No clear trend |
  | −49 to −15 | Downtrend |
  | ≤ −50 | Strong downtrend |

- **Agreement** (High / Medium / Low): how many of the scored checks point the same way. A group counts as pointing up or down from ±0.25; agreement is the share of all groups with data that point the overall way, so a neutral group doesn't agree (≥ 75% High, ≥ 50% Medium: 2 of 4 is Medium, 3 of 4 High); for a Mixed rating, the share of groups that are themselves neutral. Counting groups rather than single indicators stops three trend checks from "agreeing" with each other. It was called *confidence* until the first all-coins backtest showed that ratings the checks agreed on weren't right more often, so it's named for what it measures, and the app says so.
- **Cautions**, listed with the rating but changing neither the score nor the agreement: volatility > 80%; fewer than 3 groups with data; thin trading (24h volume < 1% of market cap); and market context leaning against the rating (bullish in extreme greed (≥ 75) or with breadth < 25%; bearish in extreme fear (≤ 25) or with breadth > 75%).
- **Wording rules:** never say "buy" or "sell", never predict a price, and always phrase signals as past behavior ("has been", "is above"). Since Phase 5 the labels describe the trend (uptrend / downtrend) instead of *bullish* / *bearish*, which sounded like a forecast: eight years of backtests showed the ratings aren't one.

### How a rating is shown
Each asset page has a **"Why this rating?"** panel listing every indicator with its value, threshold, result and one sentence, for example:

> **Uptrend · Medium agreement**
> - ✅ **Trend** (+0.7): The trend is up: 3 of three trend checks point up. Below it, each part, e.g. "Price ($64,210) is 8% above its 200-day average ($59,400)."
> - ✅ **Strength vs Bitcoin** (+0.4): Over 90 days this coin moved +38% and Bitcoin +12%: it has outperformed Bitcoin by 26 percentage points.
> - ➖ **RSI** (0): RSI is 58: neither overbought nor oversold.
> - ⚠️ Reasons for caution: Volatility is high (86% a year), so these signals can change quickly.
> - Market context (not scored): Fear & Greed, breadth, all-time high, liquidity.
>
> *These signals describe past price behavior. They are not predictions or financial advice.*

The dashboard also offers a **"Signals" view**: a sortable table of all assets by score, with filters such as "beating Bitcoin", "oversold", "above 200-day average" and "unusual volume".

### Known limitations (shown on the About page)
Technical indicators lag the price and fail in sideways markets. They ignore fundamentals, news, token unlocks and regulation, and backtested thresholds don't guarantee future results. Low-liquidity coins produce noisy signals (Phase 4 adds a caution for them). The backtest page shows how often each check was "right" for the 20 largest coins, and the all-coins backtest (§8) compares the rules against simple baselines.

### Phase 4: signal quality

The goal is a rating that is **honest and calibrated**, not one that "predicts" prices. Steps 1–3 are built; the rules are described in *Checks* and *Combining signals* above.

**Step 1, structure (built):** trend checks grouped into one *Trend* group; RSI read with the trend; Fear & Greed moved out of the score into context; graded readings; thresholds widened for volatile coins; agreement counted between groups. Differences from the first draft: MACD, RSI and volume stay +1/0/−1 (only distances are graded, where the size of the move means something); "full strength" for price vs the 200-day average is ±20% rather than ±10%, because crypto routinely trades 10% from its average.

**Step 2, new metrics (built):** strength vs Bitcoin (scored, 25%); market breadth, liquidity and distance from the all-time high (context; breadth and liquidity can add cautions). No new API requests.

**Step 3, measurement (built):** `tests/research/` replays the live rules, a frozen copy of the pre-Phase-4 rules (`tests/research/v1.ts`), 90-day momentum and "always bullish" on ~1000 days for every coin in the top 100 with exchange history, split into an older and a newer half by date. `.github/workflows/backtest.yml` runs it whenever the rules change, monthly, and on demand, and publishes the report as the run summary. The in-app backtest page (20 coins) also gained a "Does confidence mean anything?" section.

**Results** ([`docs/backtest.md`](docs/backtest.md); 63 coins, July 2024 to September 2026; pegged assets left out):

| Next 30 days | Spread, older half | Spread, newer half | Right, newer half |
|---|---|---|---|
| Current rules (Phase 4) | −15.8 pts | +14.4 pts | 55.6% |
| Rules before Phase 4 | −15.4 pts | +13.3 pts | 56.5% |
| 90-day momentum | −8.4 pts | +8.4 pts | 54.0% |
| Always bullish | — | — | 44.0% |

*Spread* = average return after bullish calls minus after bearish calls.

- **New vs old rules: about the same.** The differences (about 1 point of spread) are far smaller than the swing between the two halves, and overlapping windows on correlated coins leave few independent results. The Phase 4 changes make the ratings more honest and easier to explain; the data doesn't show they made them more accurate.
- **The rules follow trends, so they depend on the market's mood.** In the older half (mostly a choppy, bounce-back market) bearish calls were followed by *gains* of about 12% on average: the signals pointed the wrong way. In the newer half (mostly falling) they pointed the right way. Both baselines show the same flip. A two-year sample holds about two market regimes, so neither half proves much.
- **Acceptance check:** "match or beat the current rules and both baselines on the newer half": met on spread at 30 days (+14.4 vs +13.3 and +8.4), roughly matched at 7 days (+2.08 vs +2.15 and +1.69). **"High confidence beats Low": not met** in the first run, where the label also went down for volatility, thin trading and market mood: High, Medium and Low were right 55.0%, 55.4% and 56.7% of the time at 30 days in the newer half, and High was the *worst* in the older half (34.8%).
- **Agreement, as now defined** (share of all checks pointing the rating's way, no cautions mixed in): at 30 days High beat Low in both halves (43.8% vs 37.7% older, 58.0% vs 55.0% newer), but only a few percent of ratings reach High (929 and 602 coin-days), and at 7 days there's no pattern (newer half: High 46.0%, Low 55.4%). Not strong enough to call it confidence.

**Decided after the first results (built)**
1. **Confidence renamed to Agreement.** Tuning it on the older half would just fit one market regime, so the rule stays, named for what it measures, and it now measures only that: volatility, thin trading, few checks and market context are listed as separate cautions instead of lowering the level. The app says agreement isn't a measure of how likely a rating is to be right, and the backtest page asks "Were ratings right more often when the checks agreed?"
2. **Pegged assets found by price, not only by list.** Any coin whose last 90 days (at least 30) move less than 10% a year, annualized, counts as pegged (`hasPeggedPrice`): tokenised money-market funds, newer stablecoins, euro tokens. Even Bitcoin's quietest stretches stay far above that; the euro moves about 7% a year against the dollar. Gold tokens move like gold (about 15%), so they're on the symbol list (`PEGGED_SYMBOLS`) with the stablecoins. The Worker records pegged coins (`pegged` in the signals document, a count in `/api/health`), doesn't rate them, and checks again once a day; coin pages explain why there's no rating; both backtests leave them out.

**Step 4: futures data (moved to Phase 5, Step 5) ⚠ verify before build**
- **Funding rate and open interest** from a public futures API (Binance `fapi/v1/premiumIndex` returns every symbol in one request; Bybit and OKX have equivalents). Very high positive funding means a crowded leveraged long; it would be a caution. Strongly negative funding reads as crowded shorts.
- Not in the Worker: the CPU check (§4) left no headroom for parsing every symbol's funding on each snapshot run. Binance futures also blocks US IP addresses; check from the Worker first and fall back to Bybit or OKX. Budget: 1 request per snapshot run.

**Considered and not planned**
- **Stablecoin supply growth and DeFi TVL** (DefiLlama free API): reasonable market-wide context, but it adds a source for a small gain.
- **On-chain data** (exchange flows, MVRV, active addresses): good sources are paid, cover only BTC and ETH, or have unclear terms.
- **Token unlock schedules:** no free source with clear terms.
- **Social sentiment:** needs scraping, which breaks the "public API with clear terms" rule.
- **Machine learning:** not transparent, and overfits easily on a few years of daily data.
- **Tuning thresholds to the backtest:** with about two market regimes of history, it would mostly fit noise.

**Constraints:** new inputs must fit the free plan's 50 requests and 10 ms of CPU per Worker run (live runs already use more and rely on Cloudflare's leeway: §4). Fewer, tested checks beat many tuned ones, and every threshold is documented in `shared/signals.ts`.

### Phase 5: accuracy (Step 1 built; Steps 2–5 tested and not shipped)

The goal: get from "barely better than chance" to a **modest, measurable edge**, honestly measured. A reliable price forecast from free public data isn't on offer, so success means a few percentage points that hold up on years the rules were never tuned on. Every rating stays explainable and every threshold stays in `shared/signals.ts`.

**Why now.** The in-app backtest (20 coins, next 7 days) shows where the rules stand: only *Strong bearish* clearly beat chance (lower 57% of the time vs 52% on any day); *Strong bullish* did worse than any day (higher 44% vs 48%); the *Leaning* ratings were noise. The averages were in the right order (+1.7% after Strong bullish, −0.9% after Strong bearish), so the extremes carry a little information. The all-coins backtest showed the same rules pointing the wrong way in one year and the right way in the next.

**Step 1: test on much more history (backtest only; no runtime cost)**
- Page Binance daily candles backwards with `startTime` (1,000 per request) to each coin's listing, back to 2017 for the oldest: about 3 requests per coin, in the GitHub backtest only.
- Report results **per calendar year and per market phase** (Bitcoin above or below its 200-day average), not just two halves, so a rule has to work across several bull markets, crashes and sideways stretches.
- **Fixed validation split:** any tuning may look only at 2017–2022; 2023 onward is the held-out test and is reported separately.
- Done when: the report covers at least 5 years for the large coins and shows each rule's spread per year.

**Step 2: rate coins against the market, not just up or down**
- Most misses come from the whole market moving: when everything falls, every bullish call looks wrong. The repeatedly documented crypto pattern is **relative momentum**: coins that beat the market over recent weeks have tended to keep beating it for a while (e.g. Liu, Tsyvinski & Wu, *Common Risk Factors in Cryptocurrency*, Journal of Finance 2022) ⚠ verify the paper's horizons before build.
- Measure each check's result against the market (the equal-weighted average of rated coins) rather than against zero: "did this coin do better than the market over the next 7 / 30 days?". The backtest adds top-fifth vs bottom-fifth relative returns.
- Then decide, on the 2017–2022 data only, whether the main rating should become relative ("stronger / weaker than the market", described as past behaviour, never as a prediction) with the up/down reading kept as context, or stay as it is.
- Done when: the backtest reports relative results, and the decision and its evidence are written here.

**Step 3: stay neutral in choppy markets**
- Trend rules get whipsawed when the market keeps reversing. Detect it with simple, explainable measures: Bitcoin's 30-day **efficiency ratio** (net move ÷ sum of daily moves; near 0 is zigzag, near 1 a clean trend) and how often market breadth crossed 50% in the last 30 days.
- In a choppy market, directional ratings become *Mixed* with the reason shown ("the market is choppy, so trend signals are unreliable"). Fewer calls, better ones.
- Thresholds chosen on 2017–2022 only.

**Step 4: fewer, stronger calls**
- Test raising the *Leaning* bands (±15 today) to ±25 or ±30 so only clear cases get a bullish or bearish label. More coins will read *Mixed*; that's the honest answer for them.

**Step 5: futures positioning (was Phase 4, Step 4): tested in the backtest, not shipped**
- Funding rate shows when leveraged traders are crowded on one side. The live futures API refuses US addresses (GitHub's runners included), so the backtest reads Binance's public archive instead (`tests/research/funding.ts`: one zipped CSV per symbol per month from `data.binance.vision`, back to September 2019). Funding data covered 74% of tuning and 91% of held-out coin-days.
- Two rule families, fixed before seeing results, settings picked on the tuning years: **funding against the crowd** (7-day average funding above a threshold reads as down, below zero as up) and **the current rules made neutral when funding shows the crowd leaning the same way**.
- **Result** (next 30 days, spread averaged year by year): the filter didn't help (picked: −8.2 tuning, −1.2 held-out, vs −8.1 / −1.9 for the current rules). Funding against the crowd (picked: above 0.05% / below 0) looked strong at first: +4.4 tuning, +16.9 held-out. Year by year it doesn't hold up:

  | Year | Up calls (negative funding) | Down calls (crowded longs) | Spread |
  |---|---|---|---|
  | 2020 | 617 | 671 | +37.2 |
  | 2021 | 655 | 1,704 | −28.4 |
  | 2022 | 3,610 | 0 | — |
  | 2023 (held-out) | 2,226 | 6 | +15.1 |
  | 2024 (held-out) | 1,366 | 400 | +18.8 |
  | 2025 (held-out) | 4,398 | 0 | — |
  | 2026 (held-out) | 4,485 | 0 | — |

  The held-out average rests on two years, one of them on 6 coin-days of down calls; the tuning years swung from +37 to −28; and against the market it was flat (−0.2 held-out), so it times a few market-wide episodes rather than telling coins apart. **It fails the acceptance rule (positive in most held-out years) and isn't shipped.** No change to the Worker, which had no CPU headroom for it anyway (§4).
- If revisited: measure the one-sided reading (crowded shorts only) against the average coin each year, over more years of data; a market-wide "crowd positioning" note could be shown as context without any claim about what comes next.

**Not planned:** more indicators built from the same prices (Bollinger bands, stochastics: they repeat the checks we have); tuning until the backtest looks good; machine learning (overfits, and ratings could no longer be explained).

**Acceptance:** on the held-out years (2023 onward), the Phase 5 rules have a positive 30-day spread in most years and a higher average spread than both the current rules and 90-day momentum; if Step 2 is adopted, top-fifth coins beat bottom-fifth coins relative to the market in most held-out years; every rating still explains every input; Worker CPU stays under 10 ms per run. If a step doesn't beat the current rules on held-out years, it isn't shipped, and the result is recorded here either way.

**Results** ([`docs/backtest.md`](docs/backtest.md); 50 coins with Binance history, March 2018 to September 2026; 2019–2022 tuning, 2023–2026 held-out; fewer than 10 coins had history in 2018, so it isn't scored):

| Next 30 days, spread averaged year by year | Tuning years | Held-out years | Held-out years positive |
|---|---|---|---|
| Current rules | −8.1 | −2.0 | 2 of 4 |
| Rules before Phase 4 | −7.2 | −2.7 | 1 of 4 |
| 90-day momentum | −2.6 | −1.8 | 1 of 4 |
| Step 3: choppy-market filter (picked: efficiency < 0.1) | −8.2 | −1.1 | 2 of 4 |
| Step 4: stricter bands (picked: ±40) | −5.8 | −2.5 | 2 of 4 |
| Step 2: top/bottom fifth vs the market (picked: 90-day return) | +2.9 | −0.9 | 1 of 4 |

- **Step 1 (built):** the backtest pages Binance back to each coin's listing, reports each year, market phase, tuning and held-out years, and scores against the market too (`tests/research/history.ts`, `compare.ts`).
- **As up/down calls the ratings have had no edge**, and on average a negative one at 30 days: the current rules were negative in 6 of 8 years (worst 2020, when downtrend ratings around the March crash were followed by big rebounds). The earlier two-year test happened to include one of the good years.
- **Steps 2–4 fail the acceptance rule** and aren't shipped. Ranking by 7-day return looked good on the held-out years (+2.5, 3 of 4) but wasn't what the tuning years picked; choosing it now would be choosing with hindsight.
- **Against the market:** any coin beat the equal-weighted average only 37.8% of the time (a few big winners pull it up). Down-pointing checks "lagged" 62% of the time, which is that base rate, not skill. Up-pointing checks beat it about 2 points more often than any coin, RSI dips in an uptrend about 11 points more (49.3%): worth watching, not proof.
- **Agreement:** unrelated to being right (held-out: High 44.8%, Low 48.3%).
- **Decision:** the labels now describe instead of forecast. *Strong bullish signals / Leaning bullish / Mixed / Leaning bearish / Strong bearish signals* became **Strong uptrend / Uptrend / No clear trend / Downtrend / Strong downtrend**; explanations no longer claim what "has often" happened next; the About page says the ratings summarise the recent past and that backtests since 2019 found them no reliable guide to the next month. The signals document moved to format version 3, so ratings are rebuilt over about 2 hours after deploying.
- **Step 5 (futures positioning):** tested in the backtest with Binance's funding archive; the one rule that looked good rests on a few episodes and fails the acceptance rule, so it isn't shipped (see Step 5 above).

---

### Phase 6: learned weights and honest uncertainty (backtest only; nothing shipped)

Prompted by an outside review: before more rules, find out what the existing checks are worth. Everything runs inside the GitHub backtest (`tests/research/deeper.ts`); nothing live changes unless a rule passes.

1. **Learned weights:** logistic regression on the same four readings (trend, strength vs Bitcoin, RSI, volume), fitted on the tuning years only (up to 2022), once for "did the coin rise over 30 days" and once for "did it beat the average coin". The learned weights then score coins like the live ones and are judged on 2023 onward.
2. **Ablation:** the current rules with one check left out at a time.
3. **Ratings in detail:** for each rating, the share that rose, average, median, average win, average loss and worst case, always next to the same figures for any coin-day.
4. **Uncertainty ranges:** 90% ranges from resampling whole months 1,000 times (block bootstrap), so overlapping days and coins that move together aren't counted as independent.

**Acceptance:** the Phase 5 rule (held-out spread higher than the current rules and 90-day momentum, positive in most held-out years) **and** the 90% range of the difference from the current rules excludes 0.

**Results** ([`docs/backtest.md`](docs/backtest.md), run 37834478061):

| Next 30 days | Weights (trend / strength / RSI / volume) | Held-out spread (avg of years) | Held-out years positive | Held-out pooled [90% range] | Difference from current [90% range] |
|---|---|---|---|---|---|
| Current rules | 45 / 25 / 15 / 15 | −2.1 | 2 of 4 | −1.7 [−7.4, +4.6] | — |
| 90-day momentum | — | −1.9 | 1 of 4 | −0.5 [−6.4, +5.4] | [−2.8, +5.4] |
| Learned (up or down) | 25 / −56 / −3 / 16 | +3.3 | 3 of 4 | +2.3 [−3.1, +8.7] | [−1.9, +10.7] |
| Learned (against the market) | −20 / 43 / 11 / −25 | −1.3 | 1 of 4 | −1.1 [−4.0, +1.6] | [−3.4, +0.9] |

- **Learned (up or down) passes the Phase 5 rule but not the range test:** its gain over the current rules could be chance. Its biggest weight is *against* strength vs Bitcoin (coins that had lagged Bitcoin did better next), which is mean reversion, the opposite of what an "Uptrend" label says. The "against the market" fit learned nearly the opposite weights and failed. Two fits on the same data disagreeing this much means there's no stable pattern to learn. **Not shipped.**
- **Ablation:** leaving out volume made the current rules worse on held-out years, and its range excludes 0 ([−1.9, −0.4]): volume is the only check with a measurable contribution. Leaving out trend made them better (−2.1 → +0.1), but within chance. RSI and strength vs Bitcoin changed little.
- **Ratings in detail:** on held-out years every rating's median 30-day return is negative or near 0, and its average is close to any coin-day's (+3.9%). The exception points the wrong way: *Strong downtrend* coins averaged +9.0% [+1.9, +19.0] and rose 50.9% of the time vs 45.8% for any coin. In the tuning years the pattern was reversed (*Strong uptrend* +13.1% vs +6.9%), partly survivorship (today's top coins). Ratings describe the recent trend; they don't forecast the next month.
- **Decision:** nothing changes in the live app. The labels already describe rather than forecast (Phase 5). Further gains would need new information (on-chain, flows, positioning), not reweighting the same price checks. The extra report sections stay in the monthly backtest so this is re-checked as new held-out months arrive.

### Phase 7: honest detail in the app, one volume test, stablecoin supply (Step 1 built; Steps 2–3 tested, not shipped)

Follows Phase 6 and a second outside review. All three steps are display-only or backtest-only; a rule reaches the live ratings only if it passes. Every variant below is fixed **before** the backtest runs, so the result can't be tuned after the fact.

**Step 1: ratings in detail on the in-app Backtest page.** Each rating, and the "any day" yardstick, gets the Phase 6 detail: median change, average when it rose, average when it fell, worst case, and a 90% range for the average from resampling whole months (`shared/stats.ts`, shared by both backtests). A short note says a rating only tells you something when its range sits clear of the yardstick's. This covers the review's "research mode" idea at the rating level only. One coin's history has too few independent episodes for per-coin figures, so the app doesn't show any.

**Step 2: one volume test.** Volume was the only check whose removal hurt in Phase 6, though with four checks tested that could be luck. Each variant replaces only the volume reading; the other checks and the live weights stay as they are:

- *Current:* 7-day ÷ 30-day average volume above 1.3 → the direction of the 7-day return.
- *Graded:* direction of the 7-day return × (ratio − 1) ÷ 0.6, capped at 1, so volume is graded like the other checks.
- *Volume surprise:* the 7-day average volume's percentile among the previous 180 days' 7-day averages; at or above the 80th (or 90th) percentile → the direction of the 7-day return.
- *Accumulation / distribution:* ratio above 1.3 with the price within ±3% over 7 days → up (buying without a price move); ratio below 0.8 with the price up more than 5% → down (a rise on fading volume); otherwise as now.

The variant with the best spread on the tuning years is picked and judged on the held-out years.

**Step 3: stablecoin supply.** This is the only non-price source with enough free daily history to test (DefiLlama `stablecoins.llama.fi/stablecoincharts/all`, total circulating USD across all stablecoins, from 2017; keyless). ETF flows start in 2024, too late to test, and the free on-chain tiers (Glassnode, CryptoQuant) have too little history. The reading is the 30-day change in total supply, using only data up to each day. Two candidates:

- *Market timing:* supply up more than L% over 30 days → every coin counts as up; down more than L% → every coin counts as down; L ∈ {0, 1, 2}, picked on the tuning years.
- *A fifth check:* reading = 30-day change ÷ 3%, capped at ±1, added to the current rules with weight 15 (the others rescaled).

If one passes, the Worker would add one market-wide request per refresh. It's well inside the 50-request limit, and only then would DefiLlama be added to §1.

**Acceptance (Steps 2 and 3):** as Phase 6. On the held-out years the spread must be higher than the current rules and 90-day momentum and positive in most years, **and** the 90% range of the difference from the current rules must exclude 0. Results are recorded here either way.

**Results** ([`docs/backtest.md`](docs/backtest.md), run 37838827221; next 30 days, held-out years 2023–2026):

| Rules | Tuning spread | Held-out spread (avg of years) | Held-out years positive | Difference from current, held-out [90% range] |
|---|---|---|---|---|
| Current rules | −8.1 | −1.9 | 2 of 4 | — |
| 90-day momentum | −2.6 | −1.8 | 1 of 4 | [−2.8, +5.3] |
| Volume: graded | −8.1 | −1.8 | 2 of 4 | [−0.1, +0.3] |
| Volume: surprise, 80th percentile (picked) | −7.8 | −1.7 | 2 of 4 | [−0.4, +0.5] |
| Volume: surprise, 90th percentile | −7.9 | −2.1 | 2 of 4 | [−0.7, +0.0] |
| Volume: accumulation / distribution | −7.9 | −1.6 | 2 of 4 | [+0.2, +0.6] |
| Stablecoin timing ±0% (picked) | +6.2 | −11.5 | 2 of 4 | [−4.8, +9.1] |
| Stablecoin timing ±1% | +1.7 | +8.9 | 2 of 3 | [−5.5, +10.3] |
| Stablecoin timing ±2% | +2.0 | +6.1 | 1 of 2 | [−10.2, +10.6] |
| Current rules + stablecoin supply as a fifth check | −9.0 | −2.0 | 2 of 4 | [−2.6, +0.8] |

- **Step 1 (built):** the in-app Backtest page shows each rating's median, average win and loss, worst case and 90% range next to the yardstick, and says whether the average stood clear of any day's.
- **Step 2 fails:** the picked variant (volume surprise, 80th percentile) changes the held-out spread by +0.2 points, within chance. Accumulation / distribution was the only variant whose range excludes 0, but it wasn't the tuning-years pick. Its gain is 0.4 points on a spread that stays negative, and with five variants tested, one range excluding 0 is about what chance gives. How volume is read barely matters, so the volume check stays as it is.
- **Step 3 fails:** stablecoin supply as market timing swung from +6.2 on the tuning years to −11.5 on the held-out years at the picked level. The ±1% level looks good held-out (+8.9), but picking it now would be choosing with hindsight, and it rests on 3 years with ranges ±10 points wide. As a fifth check it made the current rules slightly worse. Supply growth mostly tracks the market cycle it's meant to predict. DefiLlama isn't added to the Worker.
- **Decision:** nothing in the live ratings changes. The labels already describe rather than forecast (Phase 5), and the app now shows how much uncertainty its own history carries.

### Where the accuracy work stops

Phases 5–7 tested every reasonable idea within reach of free public data: different rules, learned weights, a choppy-market filter, stricter bands, ranking against other coins, futures funding, volume read four ways, and stablecoin liquidity. None beat the current rules beyond chance on the held-out years. A reliable 30-day forecast isn't in this data, so the search for one stops here. The ratings describe the recent trend, and the app shows how much (or how little) its own history supports them.

**Standing acceptance rule for any future change to the ratings:**

1. On the held-out years, a higher 30-day spread than the current rules and 90-day momentum, positive in most years.
2. A 90% range (month-block bootstrap) for the difference from the current rules that excludes 0.
3. A gain of at least 1 point of spread on the held-out years. A new input must earn its added complexity, requests and explanation; a smaller gain is rejected even if it passes 1–2.
4. Settings fixed before the run and picked on the tuning years only.

Reopen only with genuinely new information that has enough free history to backtest. The monthly backtest keeps re-checking the current rules and the Phase 6–7 analyses as new months arrive.

### Phase 8: CME futures positioning (CFTC), backtest only

This is the one source that qualifies under the reopening clause above. It's genuinely new information: who holds positions, not what price did. It's free, official and in the public domain, and it has enough history to tune and test. Nothing live changes unless a rule passes the standing acceptance rule, including the 1-point minimum gain.

**Data:** the CFTC's weekly *Traders in Financial Futures* report for CME Bitcoin futures, futures only, from the CFTC public reporting API (`publicreporting.cftc.gov`, Socrata, keyless) ⚠ verify the dataset id and the CME Bitcoin contract code before build. It has been published since December 2017. It splits open interest into asset managers, leveraged funds (mostly hedge funds), dealers and other reportables.

- **Fetching:** the backtest downloads the full history once per run, about 460 weekly rows.
- **No looking ahead:** positions are as of Tuesday, published Friday afternoon (US Eastern). A report counts from the following Saturday (UTC), so no day uses a report before it was public.
- **Scope:** Bitcoin positioning only. CME Ether futures start in February 2021, too late for the tuning years. The reading is market-wide, so every coin gets the same value on a day, like stablecoin supply in Phase 7.

**Readings, fixed before the run:**

- *Asset managers' net position* (long − short, as % of open interest), change over the last 4 reports. Asset managers mostly hold outright exposure, so rising net length means they're buying.
- *Leveraged funds at extremes*, contrarian: their net position as % of open interest, placed within its own last 52 weeks. In the top fifth → down; in the bottom fifth → up; otherwise none. Crowded hedge-fund positioning tends to unwind.

**Candidates, fixed before the run:**

1. *Asset-manager timing:* 4-week change above +L points → every coin up; below −L → every coin down; L ∈ {0, 2, 5} percentage points of open interest, picked on the tuning years.
2. *Leveraged-fund contrarian timing:* the extreme rule above, applied to every coin.
3. *A fifth check:* the asset-manager reading ÷ 5 points, capped at ±1, added to the current rules at weight 15 (the others rescaled).

**What could undermine it:**

- **Arbitrage, not views.** Since the US spot ETFs launched (January 2024), much of the leveraged-fund short is a *basis trade*: short CME futures, long the ETF, to earn the gap between them. That's arbitrage, not a view on price. The held-out years are mostly in that regime and the tuning years aren't, so a rule tuned before 2024 may read arbitrage as bearishness.
- **Coarse timing.** The data is weekly and 3 days late.
- **Few independent episodes.** Only about 4 positioning cycles fall in the tuning years.

Expect failure. The report will say so plainly either way.

**If something passes:**

- The Worker adds one CFTC request per week, cached in KV for 7 days; the 50-request limit isn't affected.
- §1 gains the CFTC as a source, with attribution.
- "Why this rating?" explains the new input in plain words.

**Acceptance:** the standing acceptance rule (§5, *Where the accuracy work stops*), including the 1-point minimum gain. The result is recorded here either way.

## 6. UI/UX design (mobile first)

**Phones are the main target.** Every screen is designed for a **360–430 px wide portrait phone** first, used one-handed. Larger screens then get extra room. "Done" for any screen means it looks right and works by thumb on a small phone (iPhone SE / small Android) before anyone looks at the desktop layout.

### Mobile layout rules
- **Bottom tab bar** with 4 tabs: **Markets · Watchlist · Signals · About**. It sits within thumb reach, respects the iPhone home-indicator safe area (`env(safe-area-inset-bottom)`), and becomes a left sidebar at ≥ 1024 px.
- **Cards and lists, not tables.** Each coin is one row about 64 px tall: logo, name and ticker; price; 24h % with ▲/▼; a tiny sparkline; and the signal badge. Market cap, volume and other columns live on the asset page, not in the list.
- **Touch targets of at least 44 × 44 px** with 8 px spacing. No hover-only features: everything a tooltip shows is also reachable by tap (an ⓘ icon opens a short explanation).
- **One column on phones.** No horizontal scrolling of the page, ever. Sideways scrolling is allowed only inside deliberate strips (trending coins, chart-range chips) that show a partial next item to hint they scroll.
- **Readable type:** 16 px base text (which also stops iOS zooming into the search box), prices in 17–20 px tabular digits, nothing below 12 px.
- **Sticky top bar** (about 48 px): app name, search icon and theme toggle. It hides when scrolling down and comes back when scrolling up, to save screen space.
- **Bottom sheets instead of pop-ups:** sort options, filters, "Why this rating?" and the ⓘ explanations slide up from the bottom and close with a swipe down or the back button.
- **Gestures are shortcuts only:** pull-to-refresh on lists, and swipe a watchlist row to remove it. Every gesture has a visible button that does the same thing.
- **Numbers fit:** large values are shortened (`$1.23T`, `$845.2M`), and tiny prices show significant digits (`$0.00001234`) so nothing wraps or gets cut off at 360 px.
- **The phone back button works as expected:** every screen and open sheet has its own history entry.

### Screens (as seen on a phone)
1. **Markets** (`#/`, home)
   - A compact market strip at the top: total market cap and 24h %, BTC dominance, and a small Fear & Greed dial. Tapping it opens a sheet with details.
   - Watchlist coins first (if any), then the top-50 list as rows (above). Signal badges appear in the rows on desktop only; on phones they would crowd the name, so ratings live on the Signals tab and coin pages, and Markets can be sorted by signal score.
   - A sort chip ("Sort: Market cap ▾") opens a bottom sheet with market cap / 24h % / 7d % / signal score.
   - A sideways-scrolling trending strip below the first 10 rows.
2. **Asset detail** (`#/asset/:id`)
   - Price header with 24h change and an "as of" time.
   - A full-width chart about 240 px tall with large range chips (**7D · 30D · 1Y**). Touch and drag to see a crosshair with price and date; the page doesn't scroll while you drag on the chart. SMA overlays and candle view sit behind a "Chart options" chip.
   - The signal summary card: the rating, its agreement and the top 2 reasons, with "See all reasons" opening the full "Why this rating?" sheet.
   - Key stats as a 2-column grid of small tiles: market cap, volume, supply, ATH and % from ATH, volatility.
   - A large star button to add to the watchlist, placed at the bottom within thumb reach.
   - Data source and attribution at the bottom.
3. **Watchlist** (`#/watchlist`): the same rows as Markets. Swipe or tap ✕ to remove, long-press to reorder, and export/import from the ⋯ menu. Stored only on this device.
4. **Signals** (`#/signals`): rows sorted by signal score, with filter chips across the top ("Oversold", "Above 200-day avg", "Unusual volume").
5. **About** (`#/about`): how signals work, limitations, data sources and attribution, privacy and an FAQ, as collapsible sections.

### On larger screens
- **Tablet (≥ 640 px):** two-column grid of rows; the chart grows to 320 px tall.
- **Desktop (≥ 1024 px):** sidebar navigation; Markets switches to a full sortable table with extra columns (1h/7d %, market cap, volume); the asset page puts the chart and the "Why this rating?" panel side by side; sheets become side panels.

### Key components
`BottomNav`, `TopBar`, `MarketStrip`, `AssetRow` (phone) / `AssetTable` (desktop), `Sparkline`, `PriceChart`, `RangeChips`, `SignalBadge`, `SignalCard`, `BottomSheet`, `WhySheet`, `StatTile`, `FreshnessStamp`, `SourceFooter`, `ErrorInline`, `Skeleton`, `DisclaimerBanner`.

### First visit
A small dismissible card above the list reads "Signals are educational, not financial advice — learn how they work". Every term (RSI, SMA, dominance) has an ⓘ that opens a one-sentence explanation in a bottom sheet.

### Installable app (PWA)
A web app manifest and icons let users "Add to Home Screen" on Android and iOS. It then opens full-screen like a native app, with a matching status-bar color and splash screen. The offline app shell (§4) means it opens instantly, even without signal.

### Visual design and themes
- Breakpoints at 640 / 1024 / 1280 px, written as `min-width` rules: the phone layout is the default, larger screens are additions.
- Dark and light themes that follow the system setting, plus a manual toggle. Dark is tuned for night-time phone use (no pure-white text on pure black).
- Numbers use tabular digits; prices are formatted with `Intl.NumberFormat` (USD default; EUR/GBP selectable in Phase 2).

### Accessibility (WCAG 2.1 AA)
- Text contrast of at least 4.5:1, checked in bright-sunlight-friendly light mode too.
- **Up and down are never shown by color alone**: ▲/▼ arrows and +/− signs always accompany them, and the palette is blue/orange rather than red/green so it works for colorblind users.
- Works with VoiceOver and TalkBack: each coin row reads as one item ("Bitcoin, 64,210 dollars, up 2.1 percent, uptrend").
- Layout holds up with phone text size set to 200%.
- Full keyboard navigation, visible focus rings, and skip-to-content on desktop.
- Charts have a visually hidden data-table alternative and an `aria-label` summary.
- Respects `prefers-reduced-motion`. Live price updates are announced politely, and only for watchlisted coins.

### Loading, empty and error states
- **Loading:** skeleton rows the same size as the real ones, so nothing jumps around under the user's thumb.
- **Empty watchlist:** a short explanation plus suggested coins to add with one tap.
- **No search results:** a link to clear the search.
- **Error:** an inline message with a Retry button, showing the last good data where it exists.
- **Offline / weak signal:** a slim banner under the top bar over the cached data.

---

## 7. Performance targets

| Metric | Target |
|---|---|
| First load on a mid-range Android phone over 4G (snapshot visible) | < 2 s |
| Largest Contentful Paint | < 2.0 s |
| Cumulative Layout Shift | < 0.05 |
| JS bundle, initial route | < 120 KB gz (chart library lazy-loaded on the asset page). Currently 49 KB. |
| Lighthouse **mobile** profile (Performance, Accessibility, Best Practices, SEO) | ≥ 90 each, enforced in CI |
| Scrolling the 50-coin list | 60 fps on a mid-range phone (no jank) |
| Tap response (Interaction to Next Paint) | < 200 ms |
| Indicator computation for 50 assets | < 50 ms on a mid-range phone |

How to get there: lazy-load routes and the chart library; serve the snapshot from the Worker as one small JSON (~40 KB gz); self-host coin logos at 32 px via the Worker cache; preconnect to the API origin.

---

## 8. Testing

| Level | Tool | What |
|---|---|---|
| Unit: indicator maths | Vitest | SMA, EMA, RSI (Wilder), MACD, volatility and score combination, checked against **known reference series** (e.g. the classic Wilder RSI example; values cross-checked with a pandas-ta export saved as fixtures). Edge cases: too little history, flat prices, gaps, NaN. |
| Unit: adapters and schemas | Vitest | Each source's response → internal type; malformed payloads are rejected; sanity checks |
| Integration | Vitest + MSW | Fetch layer: SWR, backoff, circuit breaker, failover order, stale stamps. The Worker is tested with `wrangler`'s local runtime (Miniflare). |
| Component | Vitest + Testing Library | SignalBadge text and icons; WhySheet wording; error/empty states |
| End-to-end smoke | Playwright, run at **phone sizes first** (iPhone SE 375 px, Pixel 7 412 px with touch enabled), then desktop | Check there's no horizontal scrolling and that tap targets are at least 44 px. Load the dashboard with mocked APIs → open an asset → switch chart range → add to watchlist → reload and confirm it persisted → simulate the API down and confirm the stale banner appears |
| Accessibility | `@axe-core/playwright` | No serious or critical violations on each screen, at phone and desktop sizes |
| Visual | Playwright screenshots at 360 px and 412 px | Catch text wrapping, cut-off numbers and overlap on small screens |
| Real devices | Manual, before each release | One iPhone (Safari) and one mid-range Android (Chrome): scrolling, chart touch, bottom sheets, back button, Add to Home Screen |
| Performance | Lighthouse CI | Budgets from §7 |
| Signal research | Vitest against live APIs (`vitest.research.config.ts`) | All-coins backtest of the live rules vs the pre-Phase-4 rules, 90-day momentum and always-bullish, older and newer half separately (§5 *Phase 4*) |

**CI on GitHub Actions (free for public repos):** on every PR, run lint, typecheck, unit/integration tests, build, Playwright and Lighthouse CI. A **nightly "live contract" job** calls each real API once and validates it against the schemas, giving early warning of upstream changes. A **signal backtest job** (`backtest.yml`) runs when the rules change, monthly, and on demand, and publishes its report as the run summary.

---

## 9. Deployment and operations

### Deploying (all free, no credit card)
1. Create a Cloudflare account and a **KV namespace** `SNAPSHOTS`; put its id in `wrangler.toml`.
2. One **Worker** `cryptoguru` serves the built app (`dist/`, with single-page-app fallback) and `/api/*`, and runs the cron trigger `*/10 * * * *`. `npm run deploy` builds and deploys it.
3. Store `COINGECKO_DEMO_KEY` as a Worker secret (`wrangler secret put`). It never appears in the frontend.
4. GitHub Actions deploys on every push to `main` once `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets exist.
5. Step-by-step instructions are in the README.

### Noticing and responding to problems
- `/api/health` reports the last successful fetch time per source, circuit-breaker states and the KV snapshot age.
- A free uptime monitor (e.g. UptimeRobot, 5-min checks ⚠) watches `/api/health` and alerts by email when a source has been failing for over 30 min.
- The nightly contract job opens a GitHub issue automatically when a schema check fails.
- Runbook: when a source fails, failover is automatic. The maintainer then checks the provider's changelog, updates the adapter and schema, and adds a fixture from the new response.
- The Worker logs only counts and errors, with no IP addresses or user data.

---

## 10. Legal and ethical

**Disclaimer** (in the footer, the About page and every "Why this rating?" panel):

> CryptoGuru provides general market information and automated technical-indicator signals for educational purposes only. It is not financial, investment, legal or tax advice, and it is not a recommendation to buy, sell or hold any asset. Crypto assets are highly volatile and you can lose all of your money. Signals describe past price behavior and can be wrong. Data may be delayed or inaccurate. Do your own research and consider consulting a licensed professional.

**Attribution:** "Data provided by CoinGecko" with a link (required); "Fear & Greed Index by Alternative.me" with a link; Binance, CoinPaprika and Kraken credited on the About page and in the source footer. Logos are used as supplied by CoinGecko. ⚠ Check each provider's current attribution and caching terms, including any limits on redistributing cached data.

**Why no personalized advice:** the app asks for no portfolio, income or goals, and gives the same signals to every user. This keeps it outside personalized investment-advice rules in most jurisdictions, avoids collecting financial personal data, and is more honest about what technical indicators can do.

**Privacy:** no cookies, no analytics in the MVP (Cloudflare Web Analytics, which is cookieless, is optional in Phase 2), and no accounts. The watchlist stays on the device.

**Content rules:** no "guaranteed", "moon" or urgency language, and no affiliate or exchange referral links.

---

## 11. Milestones

| Phase | Scope | Effort (1 dev) | Acceptance criteria |
|---|---|---|---|
| **0: Setup** | Repo, Vite/Svelte/TS, Tailwind, lint, CI, Pages and Worker hello-world, schemas for every source | 2–3 days | CI is green; a preview deploys on each PR; `/api/health` responds |
| **1: MVP** | Worker cron and snapshot, prices and candles endpoints with failover; dashboard (market bar, top-50 table, sparklines); asset page with 7D/30D/1Y chart; local watchlist; freshness stamps; disclaimer and About page; dark/light themes | 2–3 weeks | Every screen works one-handed on a 360 px phone with no horizontal scrolling; then also on desktop; Lighthouse mobile ≥ 90; with the primary source blocked in tests, data still loads from the fallback; with every source blocked, the last good data shows with a stale banner; no console errors |
| **2: v1 Signals** | Indicator module with tests; SignalBadge, SignalCard and WhySheet, Signals screener; Fear & Greed and trending widgets; offline app shell and Add to Home Screen (PWA); accessibility pass with axe; currency selector | 1.5–2 weeks | Indicator tests match the reference fixtures to within 0.01; every rating explains every indicator in plain English; no serious axe violations |
| **3: Polish and trust** | Signal backtest page (how often each signal was followed by a rise or fall); watchlist export/import; optional cookieless analytics; nightly contract job opening issues; news feed only if a source with suitable terms is found | 1.5–2 weeks | The backtest reproduces the documented results; a contract failure opens an issue within 24 h |
| **4: Signal quality** | Group the trend checks, make RSI depend on the trend, move Fear & Greed to context, graded scores and volatility-scaled thresholds; strength vs BTC, distance from all-time high, market breadth and liquidity; backtest across all coins with walk-forward and calibration checks; futures funding rate if reachable (see §5, *Phase 4*) | 2–3 weeks | On the newer half of the history, the new rules match or beat the current rules and both baselines; High-agreement ratings have a better hit rate than Low (not met: renamed from confidence, see §5); Worker CPU stays under 10 ms per run; every new input is explained in "Why this rating?" |
| **5: Accuracy** | Backtest back to 2017, reported per year and market phase, tuned on 2017–2022 and tested on 2023 onward; results measured against the market (relative momentum); a choppy-market filter; stricter bullish/bearish bands; futures funding and open interest if reachable (see §5, *Phase 5*) | 1.5–2 weeks | On the held-out years, positive 30-day spread in most years and higher than the current rules and 90-day momentum; steps that don't beat the current rules aren't shipped; Worker CPU under 10 ms per run |
| **6: Learned weights** | Logistic-regression weights fitted on the tuning years; one-check-out ablation; per-rating median, wins, losses and worst case vs any coin-day; block-bootstrap 90% ranges (see §5, *Phase 6*) | 2–3 days | Phase 5 acceptance, and the range of the difference from the current rules excludes 0 (not met: nothing shipped) |
| **7: Detail, volume, stablecoins** | Per-rating median, wins, losses, worst case and ranges on the in-app Backtest page; one volume test with variants fixed in advance; stablecoin supply (DefiLlama) as market timing and as a fifth check (see §5, *Phase 7*) | 3–4 days | Backtest page shows the detail at phone width; Steps 2–3 pass the Phase 6 acceptance or aren't shipped (Step 1 built; Steps 2–3 not met, nothing shipped) |
| **8: Futures positioning** | CFTC Traders in Financial Futures for CME Bitcoin (weekly, since Dec 2017): asset-manager timing, leveraged-fund contrarian timing, and a fifth check, all fixed in advance and backtest-only (see §5, *Phase 8*) | 2–3 days | Standing acceptance rule incl. the 1-point minimum gain; otherwise nothing ships |
| **Later** | Price alerts in the browser (Notification API while the tab is open); more currencies and languages | — | — |

**Total to v1: about 5–6 weeks** for one developer working part-time-to-full-time.

**Status:** Phases 0–3 are built, including the Phase 1 leftovers, and tested against mocked APIs (browser tests at 360/375/412 px phones and desktop).
- Phase 2: signals; offline app shell and install; currency selector; accessibility checks on every screen and sheet.
- Phase 3:
  - **Backtest** (`#/signals/backtest`): the live rules replayed on ~1,000 daily candles for the 20 largest non-stable coins, at 7- and 30-day horizons, each result shown next to the "any day" baseline, with caveats (overlapping windows, correlated coins, survivorship, no costs). Engine in `shared/backtest.ts`, tested for no look-ahead, identical rules to live, and a fixed reference result; runs in a Web Worker and is cached for the day. History comes from `/api/history/:id` (Binance, then Kraken; CoinGecko's free plan only has a year) and `/api/fear-greed/history`.
  - **Watchlist export/import** as a small JSON file; imports only add; saved coins that left the top 100 are listed with a Remove button instead of silently hidden.
  - **Nightly API contract check** (`.github/workflows/contract.yml`): calls every real API once, opens a labelled issue on failure, comments if one is open, closes it when passing again.
  - **Cookieless analytics:** off unless built with `VITE_CF_ANALYTICS_TOKEN` (Cloudflare Web Analytics).
  - **News feed:** not added; see §1.

- Phase 1 leftovers:
  - **Lighthouse CI** (`lighthouserc.cjs`, `ci.yml` job `lighthouse`): mobile profile against the built app with mock data (`MOCK_API=1`), 3 runs × 3 screens, judged on the median run. Every budget in §7 is enforced. Current results: Performance 99–100, Accessibility 100, Best Practices 100, SEO 100; LCP 1.2–1.85 s; CLS 0; TBT under 100 ms; initial JS 55 KB. Getting there fixed real issues: a missing `robots.txt`; layout shift on Markets, Signals and coin pages (now fixed-size placeholders); the coin page waiting on the whole snapshot (sections now load independently, the chart library and 1-year history load when idle, and the coin page shows the server's rating when it is recent, so it always matches the Signals list); big data kept deeply reactive (now stored raw); sparklines sent with 16 digits (now 5).
  - **Gestures:** pull-to-refresh on Markets, Watchlist and Signals; swipe a watchlist row left to reveal Remove, or further to remove it, with Undo (also for Edit-mode removals). Tested with real touch input on the phone projects.

Deployed to Cloudflare by `.github/workflows/deploy.yml` on every push to `main`; the nightly contract check has passed against all live APIs.

- Phase 4: Steps 1–3 built (157 unit tests, 112 browser tests). All-coins backtest: the new rules match the old ones and beat both baselines on the newer half; agreement between the checks predicts being right only weakly at best, so "confidence" is now "agreement"; pegged assets are found by how little their price moves. See §5 *Phase 4*. Futures funding moved to Phase 5.
- Phase 5 (accuracy): Step 1 built (backtest back to 2018, year by year); Steps 2–4 tested and not shipped (none beat the current rules on held-out years); ratings relabelled as uptrend / downtrend, since no rule tested is a reliable forecast. Step 5 (futures funding) tested in the backtest and not shipped: the promising result rested on a few episodes. See §5 *Phase 5*.
- Phase 6 (learned weights, backtest only): learned weights beat the current rules on held-out years but within chance, and leaned on mean reversion; not shipped. Volume is the only check with a measurable contribution; no rating's next-month returns differ reliably from any coin's in the right direction. See §5 *Phase 6*.
- Phase 7: Step 1 built (the in-app Backtest page shows each rating's median, wins, losses, worst case and 90% range against the yardstick). Steps 2–3 tested and not shipped: no volume variant improves on the current reading beyond chance, and stablecoin supply failed both as market timing and as a fifth check. See §5 *Phase 7*.
- Phase 8 (CME futures positioning from the CFTC, backtest only): planned. See §5 *Phase 8*.

---

## 12. Risks and open questions

| Risk / question | Impact | Mitigation |
|---|---|---|
| CoinGecko changes free-tier limits or terms ⚠ | Rankings and metadata stop updating | Cron-only usage with a fixed budget; CoinPaprika fallback; adapters keep sources swappable |
| Binance mirror blocked or geo-restricted for Worker IPs ⚠ | Live prices and candles fall back to slower sources | Ordered failover to CoinGecko and Kraken; health endpoint alerts |
| Cloudflare KV write limit (1k/day) or Worker limit (100k req/day) reached ⚠ | Stale snapshot or API errors | Low write budget (~240/day); traffic beyond the limit triggers browser-direct fallback; consider the paid tier only if traffic justifies it |
| Worker CPU over the free plan's 10 ms per run (measured P50 10.9 ms, P90 26 ms) ⚠ | Cloudflare could start stopping runs: signal batches unfinished, ratings going stale | No errors so far (0 "Exceeded CPU"); watch the Errors chart and `/api/health` (`stale`, `lastRunSecondsAgo`); fix ready: `BATCH` 8 → 4 and a 4-hour refresh |
| Users treat signals as advice | Legal and reputational risk; user losses | Neutral wording, no buy/sell language, disclaimer on every rating, published limitations and backtest |
| Wrong or manipulated data from one source | Misleading prices or signals | Schema validation, sanity bounds, cross-source check for large moves |
| Symbol collisions (same ticker for different coins) | Wrong candles for a coin | Map by CoinGecko ID → explicit Binance pair table; never match by ticker alone |
| Indicator thresholds are arbitrary | Signals feel unreliable | Use the standard textbook values, document them, and let the Phase 3 backtest inform tuning; Phase 4 tunes only on older data and reports results on newer data |
| Can attribution and redistribution terms allow caching data for all users? ⚠ | Possible terms violation | Read each provider's terms before building; keep cache times short; switch provider if needed |
| **Open:** should the default list cover top 50 or top 100? | Upstream cost and UI density | Fetch 100 (same single call) and display 50 by default with "show more" |
| **Resolved:** fiat currencies other than USD | — | Rates derived from CoinGecko `/global` market caps in each currency: no extra API and no extra calls |
