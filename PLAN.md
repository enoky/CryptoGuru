# CryptoGuru — Implementation Plan

> Produced from [`PROMPT.md`](./PROMPT.md). Items marked **⚠ verify before build** depend on free-tier limits or API terms that change often; check them against the provider's current docs before writing code.

**One-line summary:** a static Svelte single-page app on Cloudflare Pages. Behind it sits one Cloudflare Worker that caches CoinGecko and Binance public data for all users. In the browser, the app computes transparent technical-indicator signals and explains each one in plain English. Running cost is $0; there are no user accounts and no tracking.

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
| News (optional, post-MVP) | Not chosen: no free source has clearly suitable terms. Revisit in Phase 3. | — | — |

Stablecoins and coins without a Binance USDT pair (e.g. LEO) use the CoinGecko candle path. The Worker maintains a `symbol → Binance pair` map built from `/api/v3/exchangeInfo` once a day.

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
| Global stats | cron every 30 min | 15 min | every 15 min |
| Trending | cron every 60 min | 30 min | on load |
| Fear & Greed | cron every 60 min | 1 h | on load |
| Hourly candles (7d) | 15 min | 15 min | on opening an asset |
| Daily candles (1y) | 1 h | 6 h (IndexedDB) | on opening an asset |

Every layer uses **stale-while-revalidate**: return the cached value immediately and refresh it in the background. Polling pauses when the tab is hidden (`visibilitychange`).

### Request budget (per month, regardless of visitor count)

| Upstream call | Frequency | Calls/month |
|---|---|---|
| CoinGecko `/coins/markets` (top 100, one page) | 144/day | ~4,460 |
| CoinGecko `/global` | 48/day | ~1,490 |
| CoinGecko `/search/trending` | 24/day | ~740 |
| CoinGecko candle fallbacks (≈10 non-Binance coins × 4/day) | 40/day | ~1,240 |
| **CoinGecko total** | | **~7,930 / 10,000** ⚠ |
| KV writes (markets + global + trending + F&G + pair map) | ~240/day | under the 1,000/day limit ⚠ |
| Worker requests | grow with traffic | the free tier is 100k/day ⚠, enough for roughly 5–10k daily visitors |

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

### Indicators

| # | Signal | Formula | Bullish (+1) | Bearish (−1) | Neutral (0) | Weight |
|---|---|---|---|---|---|---|
| 1 | Long-term trend | Close vs SMA200 | Close > SMA200 | Close < SMA200 | within ±2% | 25 |
| 2 | Trend cross | SMA50 vs SMA200 | SMA50 > SMA200 | SMA50 < SMA200 | within ±1% | 15 |
| 3 | Momentum | MACD(12,26,9) histogram | > 0 and rising for 3 days | < 0 and falling for 3 days | otherwise | 20 |
| 4 | RSI(14), Wilder | `100 − 100/(1+RS)` | < 30 (oversold) | > 70 (overbought) | 30–70 | 15 |
| 5 | Volume confirmation | 7d avg volume ÷ 30d avg volume | > 1.3 and 7d return > 0 | > 1.3 and 7d return < 0 | ratio ≤ 1.3 | 10 |
| 6 | Market mood (same for every coin) | Fear & Greed | ≤ 25 (extreme fear: contrarian) | ≥ 75 (extreme greed) | 26–74 | 15 |

**Context only, not scored:** 30-day annualized volatility (`stdev(ln returns) × √365`) labeled Low < 40%, Medium 40–80%, High > 80%. Also distance from all-time high, and 1h/24h/7d/30d returns.

### Combining signals
- `score = Σ(weightᵢ × signalᵢ) / Σ(weightᵢ of indicators that had enough data) × 100`, giving a range of −100 to +100.
- **Overall rating:**

  | Score | Label shown |
  |---|---|
  | ≥ 50 | Strong bullish signals |
  | 15 to 49 | Leaning bullish |
  | −14 to 14 | Mixed / neutral |
  | −49 to −15 | Leaning bearish |
  | ≤ −50 | Strong bearish signals |

- **Confidence** (High / Medium / Low): the share of non-neutral indicators that agree with the overall direction (≥ 75% High, ≥ 50% Medium), lowered one level if volatility is High or if fewer than 5 indicators had enough data.
- **Wording rules:** never say "buy" or "sell", never predict a price, and always phrase signals as past behavior ("has been", "is above").

### How a rating is shown
Each asset page has a **"Why this rating?"** panel listing every indicator with its value, threshold, result and one sentence, for example:

> **Leaning bullish · Medium confidence**
> - ✅ Price ($64,210) is 8% above its 200-day average ($59,400). Long-term trend is up.
> - ✅ MACD momentum has been positive and rising for 4 days.
> - ➖ RSI is 58: neither overbought nor oversold.
> - ⚠️ Volatility is High (86% annualized), so these signals change quickly.
>
> *These signals describe past price behavior. They are not predictions or financial advice.*

The dashboard also offers a **"Signals" view**: a sortable table of all assets by score, with filters such as "oversold", "above 200-day average" and "unusual volume".

### Known limitations (shown on the About page)
Technical indicators lag the price and fail in sideways markets. They ignore fundamentals, news, token unlocks and regulation, and backtested thresholds don't guarantee future results. Low-liquidity coins produce noisy signals. Phase 3 adds a simple historical backtest page so users can see how often each signal was "right".

---

## 6. UI/UX design

### Screens
1. **Dashboard** (`#/`)
   - Market bar: total market cap, 24h change, BTC dominance, and a Fear & Greed gauge.
   - Watchlist cards, shown first if the user has any.
   - Top-50 table: rank, name/logo, price, 1h/24h/7d %, market cap, volume, 7d sparkline and a signal badge. Sortable, with search.
   - Trending strip.
   - On mobile the table becomes cards with the most important columns, and the rest appears on tap.
2. **Asset detail** (`#/asset/:id`)
   - Price header with "as of" time.
   - Chart with 7D / 30D / 1Y tabs and toggles for SMA50/200 overlays and line/candle view.
   - Key stats grid: market cap, volume, circulating/max supply, ATH and % from ATH, volatility.
   - "Why this rating?" panel.
   - Data source and attribution.
3. **Watchlist** (`#/watchlist`): add/remove with a star, drag to reorder, and export/import as JSON. Stored only on this device.
4. **Signals** (`#/signals`): a screener table of scores with the filters above.
5. **About and disclaimer** (`#/about`): how signals work, their limitations, data sources and attribution, the privacy statement and an FAQ.

### Key components
`MarketBar`, `AssetTable`/`AssetCard`, `Sparkline`, `PriceChart`, `SignalBadge`, `WhyPanel`, `FreshnessStamp`, `SourceFooter`, `ErrorInline`, `Skeleton`, `DisclaimerBanner`.

### First visit
A dismissible banner reads "Signals are educational, not financial advice — learn how they work". Tooltips explain every term (RSI, SMA, dominance) in one sentence.

### Visual design and themes
- Mobile-first, with breakpoints at 640 / 1024 / 1280 px.
- Dark and light themes that follow the system setting, plus a manual toggle.
- Numbers use tabular digits; prices are formatted with `Intl.NumberFormat` (USD default; EUR/GBP selectable in Phase 2).

### Accessibility (WCAG 2.1 AA)
- Text contrast of at least 4.5:1.
- **Up and down are never shown by color alone**: ▲/▼ arrows and +/− signs always accompany them, and the palette is blue/orange rather than red/green so it works for colorblind users.
- Full keyboard navigation, visible focus rings, and skip-to-content.
- Charts have a visually hidden data-table alternative and an `aria-label` summary.
- Respects `prefers-reduced-motion`. Live price updates are announced politely, and only for watchlisted coins.

### Loading, empty and error states
- **Loading:** skeleton rows the same size as the real ones, so the layout doesn't shift.
- **Empty watchlist:** a short explanation plus suggested coins to add.
- **No search results:** a link to clear the search.
- **Error:** an inline message with a Retry button, showing the last good data where it exists.
- **Offline:** a banner over the cached data.

---

## 7. Performance targets

| Metric | Target |
|---|---|
| First load on 4G (snapshot visible) | < 2 s |
| Largest Contentful Paint | < 2.0 s |
| Cumulative Layout Shift | < 0.05 |
| JS bundle, initial route | < 120 KB gz (chart library lazy-loaded on the asset page) |
| Lighthouse (Performance, Accessibility, Best Practices, SEO) | ≥ 90 each, enforced in CI |
| Indicator computation for 50 assets | < 50 ms on a mid-range phone |

How to get there: lazy-load routes and the chart library; serve the snapshot from the Worker as one small JSON (~40 KB gz); self-host coin logos at 32 px via the Worker cache; preconnect to the API origin.

---

## 8. Testing

| Level | Tool | What |
|---|---|---|
| Unit: indicator maths | Vitest | SMA, EMA, RSI (Wilder), MACD, volatility and score combination, checked against **known reference series** (e.g. the classic Wilder RSI example; values cross-checked with a pandas-ta export saved as fixtures). Edge cases: too little history, flat prices, gaps, NaN. |
| Unit: adapters and schemas | Vitest | Each source's response → internal type; malformed payloads are rejected; sanity checks |
| Integration | Vitest + MSW | Fetch layer: SWR, backoff, circuit breaker, failover order, stale stamps. The Worker is tested with `wrangler`'s local runtime (Miniflare). |
| Component | Vitest + Testing Library | SignalBadge text and icons; WhyPanel wording; error/empty states |
| End-to-end smoke | Playwright (Chromium) | Load the dashboard with mocked APIs → open an asset → switch chart range → add to watchlist → reload and confirm it persisted → simulate the API down and confirm the stale banner appears |
| Accessibility | `@axe-core/playwright` | No serious or critical violations on each screen |
| Performance | Lighthouse CI | Budgets from §7 |

**CI on GitHub Actions (free for public repos):** on every PR, run lint, typecheck, unit/integration tests, build, Playwright and Lighthouse CI. A **nightly "live contract" job** calls each real API once and validates it against the schemas, giving early warning of upstream changes.

---

## 9. Deployment and operations

### Deploying (all free, no credit card)
1. Create a Cloudflare account. Create a **Pages** project connected to the GitHub repo (build: `npm run build`, output: `dist`).
2. Create a **Worker** `cryptoguru-api` with a **KV namespace** `SNAPSHOTS` and a cron trigger `*/10 * * * *`. Deploy it with `wrangler deploy` from GitHub Actions on merge to `main`.
3. Store `COINGECKO_DEMO_KEY` as a Worker secret (`wrangler secret put`). It never appears in the frontend.
4. Route the Worker at `/api/*` on the Pages domain (or use Pages Functions) so it's same-origin and needs no CORS setup.
5. Config: `wrangler.toml` holds TTLs, cron schedule and source order; the frontend `.env` holds only `VITE_API_BASE`.
6. Pages preview deployments run automatically for each PR.

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
| **1: MVP** | Worker cron and snapshot, prices and candles endpoints with failover; dashboard (market bar, top-50 table, sparklines); asset page with 7D/30D/1Y chart; local watchlist; freshness stamps; disclaimer and About page; dark/light themes | 2–3 weeks | Works on mobile and desktop; Lighthouse ≥ 90; with the primary source blocked in tests, data still loads from the fallback; with every source blocked, the last good data shows with a stale banner; no console errors |
| **2: v1 Signals** | Indicator module with tests; SignalBadge, WhyPanel, Signals screener; Fear & Greed and trending widgets; offline app shell; accessibility pass with axe; currency selector | 1.5–2 weeks | Indicator tests match the reference fixtures to within 0.01; every rating explains every indicator in plain English; no serious axe violations |
| **3: Polish and trust** | Signal backtest page (how often each signal was followed by a rise or fall); watchlist export/import; optional cookieless analytics; nightly contract job opening issues; news feed only if a source with suitable terms is found | 1.5–2 weeks | The backtest reproduces the documented results; a contract failure opens an issue within 24 h |
| **Later** | Price alerts in the browser (Notification API while the tab is open); PWA install; more currencies and languages | — | — |

**Total to v1: about 5–6 weeks** for one developer working part-time-to-full-time.

---

## 12. Risks and open questions

| Risk / question | Impact | Mitigation |
|---|---|---|
| CoinGecko changes free-tier limits or terms ⚠ | Rankings and metadata stop updating | Cron-only usage with a fixed budget; CoinPaprika fallback; adapters keep sources swappable |
| Binance mirror blocked or geo-restricted for Worker IPs ⚠ | Live prices and candles fall back to slower sources | Ordered failover to CoinGecko and Kraken; health endpoint alerts |
| Cloudflare KV write limit (1k/day) or Worker limit (100k req/day) reached ⚠ | Stale snapshot or API errors | Low write budget (~240/day); traffic beyond the limit triggers browser-direct fallback; consider the paid tier only if traffic justifies it |
| Users treat signals as advice | Legal and reputational risk; user losses | Neutral wording, no buy/sell language, disclaimer on every rating, published limitations and backtest |
| Wrong or manipulated data from one source | Misleading prices or signals | Schema validation, sanity bounds, cross-source check for large moves |
| Symbol collisions (same ticker for different coins) | Wrong candles for a coin | Map by CoinGecko ID → explicit Binance pair table; never match by ticker alone |
| Indicator thresholds are arbitrary | Signals feel unreliable | Use the standard textbook values, document them, and let the Phase 3 backtest inform tuning |
| Can attribution and redistribution terms allow caching data for all users? ⚠ | Possible terms violation | Read each provider's terms before building; keep cache times short; switch provider if needed |
| **Open:** should the default list cover top 50 or top 100? | Upstream cost and UI density | Fetch 100 (same single call) and display 50 by default with "show more" |
| **Open:** fiat currencies other than USD? | Conversion source needed | Use CoinGecko `vs_currency` in Phase 2 rather than adding another FX API |
