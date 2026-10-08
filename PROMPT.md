# CryptoGuru — Planning Prompt

## Original

> Plan a web app that can be hosted for free. It's purpose is aggregating up to date information on popular crypto assets, and making recommendations. It should only access public API's and data. It must have a friendly user interface. It must be useful and robust.

## Improved

You are a senior full-stack engineer and product designer. Produce a **detailed, implementation-ready plan** (not code) for a web app called **CryptoGuru**.

### Goal

CryptoGuru gathers current market data on popular crypto assets from public sources, shows it in a clear, friendly dashboard, and produces **transparent, rule-based signals** (e.g. "momentum: bullish", "overbought") with a plain-language explanation of why each signal was produced. It is an informational tool, **not financial advice**, and must say so prominently.

### Hard constraints

1. **$0 hosting and running cost.** Use only free tiers that don't need a credit card (e.g. GitHub Pages, Cloudflare Pages/Workers, Vercel, Netlify). Prefer a static frontend; add a serverless function or scheduled job only if it's needed for CORS, caching, or rate limits, and justify it.
2. **Public data only.** Use free, public APIs and data that need no API key, or at most a free key that never ships to the browser. No scraping that breaks a site's terms of service, no user accounts, and no paid data.
3. **No backend database to maintain.** Any persistence must be client-side (localStorage/IndexedDB) or a free managed option that needs no upkeep.
4. **Privacy.** No tracking, and no personal data collected. Watchlists and preferences stay on the user's device.

### Scope

- **Assets:** the top ~50 by market cap by default, plus a user-editable watchlist.
- **Data per asset:** price, 1h/24h/7d change, market cap, volume, a 7d/30d/1y price chart, and supply.
- **Market-wide context:** total market cap, BTC dominance, Fear & Greed index, and trending coins.
- **Signals and recommendations:** computed from standard indicators (e.g. moving-average crossovers, RSI, volatility, volume trends, distance from all-time high). Each signal shows its inputs, its thresholds, and a confidence label. No black-box or "guaranteed" predictions.
- **Optional extra:** a short news or headlines feed, only if a free source with clear terms exists.

### What the plan must include

1. **Data sources:** a table listing each candidate API (e.g. CoinGecko, CoinCap, CoinPaprika, Binance public endpoints, Alternative.me Fear & Greed) with its endpoints, rate limits, CORS support, terms-of-use notes, and which features it powers. Name a **primary source and a fallback** for each data type.
2. **Architecture:** a diagram or description of how data flows from the APIs through the optional edge cache or proxy to the client, with the reasoning for each choice.
3. **Tech stack:** framework, charting library, styling, and state management, each with a one-line justification. Favor small bundles and fast loads.
4. **Robustness strategy:**
   - caching with TTLs per data type, and stale-while-revalidate
   - rate-limit handling (request batching, backoff, and a request budget that fits the free tiers)
   - automatic failover to the fallback source
   - graceful degradation: show the last good data with a "data as of HH:MM" stamp, never a blank screen
   - validating API responses so malformed data can't crash the UI
5. **Recommendation engine:** the exact indicators, formulas, thresholds, and how signals combine into an overall rating. Explain how each rating is shown to users in plain English, and cover the known limitations.
6. **UI/UX design:** the main screens (dashboard, asset detail, watchlist, about/disclaimer), the key components, a **mobile-first** layout (designed for a 360–430 px phone used one-handed first, then scaled up to tablet and desktop), dark/light themes, accessibility (WCAG 2.1 AA, keyboard navigation, colorblind-safe up/down colors), and loading, empty, and error states.
7. **Performance targets:** e.g. first load under 2 s on 4G, a Lighthouse score of 90+, and the refresh interval for each view.
8. **Testing:** unit tests for the indicator math using known datasets, mocked-API integration tests, and an end-to-end smoke test. Include CI on a free tier (e.g. GitHub Actions).
9. **Deployment and operations:** step-by-step free deployment, environment configuration, and how you'd notice and respond when an upstream API changes or goes down.
10. **Legal and ethical:** the disclaimer wording, attribution required by the data providers, and the reasons the app avoids personalized financial advice.
11. **Milestones:** an MVP that ships first, then v1 and later phases, with rough effort estimates and acceptance criteria for each.
12. **Risks and open questions:** list them, each with a proposed mitigation.

### Output format

Use Markdown with clear headings that match the numbered sections above, and tables where they help. Be concrete: name specific endpoints, libraries, and numbers rather than giving generic advice. Where free-tier limits or API terms may have changed recently, flag them as **"verify before build."**
