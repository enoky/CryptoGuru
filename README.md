# CryptoGuru

Live prices, charts and plain-English market context for the top 100 crypto assets. Designed for phones first, free to host, with no accounts and no tracking.

- **Markets:** market overview (total market cap, BTC dominance, Fear & Greed), searchable and sortable top-100 list with 7-day sparklines, trending coins.
- **Coin pages:** 7D / 30D / 1Y touch-friendly chart, key stats with ⓘ explanations, 30-day volatility, add to watchlist.
- **Watchlist:** saved on the device only; reorder or remove in edit mode.
- **Robust:** every data type has backup sources; if everything is down the app shows the last saved data with a clear "as of" time.
- **Works offline and installs like an app:** after one visit it opens with no connection; add it to your home screen from the About tab.
- **How reliable are signals?** A backtest replays the rules on ~2½ years of prices for the 20 largest coins and shows how often each check was followed by a rise or fall, next to how often prices rose on any day, and whether ratings were right more often when the checks agreed. A larger backtest over the whole top 100 runs on GitHub ([first results](docs/backtest.md)).
- **Move your watchlist:** save it to a file and load it on another phone (Watchlist → ⋯).
- **Your currency:** USD, EUR, GBP, CAD, AUD, JPY, INR or CHF (top bar), converted with CoinGecko's exchange rates.
- **Signals:** four checks per coin (trend, which averages the 200-day trend, 50/200 cross and MACD; strength vs Bitcoin; RSI read with the trend; volume) combined into a −100…+100 score, shown as Strong uptrend, Uptrend, No clear trend, Downtrend or Strong downtrend, with an agreement level (how many checks point the same way) and any cautions, plus market context that never changes the score (Fear & Greed, breadth, liquidity, distance from the all-time high). Every reason is spelled out in plain English. The ratings describe the recent trend; backtests since 2019 found them no reliable guide to the next month. Stablecoins and other pegged assets (found by how little their price moves) aren't rated. The Signals tab ranks and filters all coins. Not predictions or financial advice.

See [`PLAN.md`](./PLAN.md) for the full design and [`PROMPT.md`](./PROMPT.md) for the brief it came from.

## How it works

```
Browser (Svelte app) ──► Cloudflare Worker /api/*  ──► CoinGecko, Binance, CoinPaprika, Kraken, Alternative.me
        │                   ├─ cron every 10 min → KV snapshot (last good data)
        │                   ├─ cron 5 min later → rate the next 8 coins → KV signals
        │                   └─ in-memory + edge cache for prices and charts
        └─ if the Worker is unreachable, calls the same public APIs directly
```

| Path | What |
|---|---|
| `src/` | The Svelte 5 app (routes, components, client data layer) |
| `shared/` | API clients, validation, failover — used by both the Worker and the browser |
| `worker/` | The Cloudflare Worker: `/api/snapshot`, `/api/prices`, `/api/candles/:id?range=7d\|30d\|1y`, `/api/signals`, `/api/health`, and the two cron jobs |
| `tests/unit/` | Vitest tests (formatting, maths, every API client, failover, the Worker) |
| `tests/e2e/` | Playwright tests at 360, 375 and 412 px phone sizes, then desktop, with mocked APIs (`offline.spec.ts` runs with the service worker on) |
| `src/sw/sw.template.js` | The service worker; the build fills in the list of files to keep offline (see `vite.config.ts`) |
| `scripts/make-icons.mjs` | Re-renders the PNG app icons from `public/icon.svg` |

## Develop

Needs Node 22.

```bash
npm install
npm run dev          # app at http://localhost:5173
npm run worker:dev   # optional, in a second terminal: the API at :8787 (Vite proxies /api to it)
```

Without `worker:dev`, the app falls back to calling the public APIs straight from the browser, so `npm run dev` alone works too.

```bash
npm run check        # typecheck app + Worker
npm test             # unit tests
npx playwright test  # browser tests (builds first)
npm run lighthouse   # speed and quality budgets on the mobile profile (needs Chromium: npx playwright install chromium)
```

Try the app with fake data and no network: `MOCK_API=1 npm run dev`.

## Deploying (free, about 10 minutes, nothing to install)

Everything runs on Cloudflare's free plan as one Worker that serves both the app and the API. No credit card needed. GitHub Actions does the deploying.

1. **Create a free [Cloudflare account](https://dash.cloudflare.com/sign-up)**, then open **Workers & Pages** once in the dashboard. On a new account it asks you to pick a `workers.dev` subdomain: your app will live at `cryptoguru.<subdomain>.workers.dev`.
2. **Create an API token:** profile icon → **My Profile → API Tokens → Create Token**, use the **Edit Cloudflare Workers** template, choose your account under *Account Resources* (and *All zones* under *Zone Resources*), then **Continue to summary → Create Token**. Copy the token; it's shown once.
3. **Find your Account ID:** **Workers & Pages** → it's in the right-hand column (or in the dashboard URL after `dash.cloudflare.com/`).
4. **Add them to GitHub:** this repository → **Settings → Secrets and variables → Actions → New repository secret**:
   - `CLOUDFLARE_API_TOKEN`: the token from step 2
   - `CLOUDFLARE_ACCOUNT_ID`: the id from step 3
   - `COINGECKO_DEMO_KEY` (optional but recommended): a free [CoinGecko Demo API key](https://www.coingecko.com/en/api/pricing), no card needed. The deploy copies it into the Worker (and removes it again if you delete the secret); it's never sent to the browser. The nightly API check uses it too.
5. **Deploy:** **Actions → Deploy → Run workflow** (after that, every push to `main` deploys by itself). The run's summary shows your URL and a first health check. The KV storage the app needs is created automatically on the first deploy.
6. **Check it:** open the URL, and `/api/health` on it. Signals fill in over the first ~2 hours as coins are rated in batches.
7. **After a day:** Cloudflare dashboard → **Workers & Pages → cryptoguru → Metrics → CPU time**. Free-plan runs are cut off at 10 ms of CPU; if you see errors, lower `BATCH` in `worker/signals.ts`.

<details><summary>Deploying from your own computer instead</summary>

```bash
npx wrangler login
npx wrangler secret put COINGECKO_DEMO_KEY   # optional; after the first deploy
npm run deploy
```
</details>

**Nightly API check:** `.github/workflows/contract.yml` runs every night (or from the Actions tab) and opens an issue labelled `api-contract` if an API changes. Add `COINGECKO_DEMO_KEY` as a repository secret so it uses your key.

**Signal backtest:** `.github/workflows/backtest.yml` replays the rules on ~1000 days for every coin in the top 100 and compares them with the previous rules and two simple baselines. It runs when the rules or the code they compute from change (`shared/signals.ts`, `backtest.ts`, `indicators.ts`, `series.ts`, `candles.ts`), monthly, and from the Actions tab; the report is the run's summary.

**Optional cookieless analytics:** create a site in Cloudflare → Web Analytics, then add its token as a repository *variable* `CF_ANALYTICS_TOKEN` (or set `VITE_CF_ANALYTICS_TOKEN` when building). No cookies or personal data; the About page mentions it automatically when it's on.


## Disclaimer

For information only. Not financial, investment, legal or tax advice. Data may be delayed or inaccurate.
