# CryptoGuru

Live prices, charts and plain-English market context for the top 100 crypto assets. Designed for phones first, free to host, with no accounts and no tracking.

- **Markets:** market overview (total market cap, BTC dominance, Fear & Greed), searchable and sortable top-100 list with 7-day sparklines, trending coins.
- **Coin pages:** 7D / 30D / 1Y touch-friendly chart, key stats with ⓘ explanations, 30-day volatility, add to watchlist.
- **Watchlist:** saved on the device only; reorder or remove in edit mode.
- **Robust:** every data type has backup sources; if everything is down the app shows the last saved data with a clear "as of" time.
- **Signals:** planned for the next release (see [`PLAN.md`](./PLAN.md) §5).

See [`PLAN.md`](./PLAN.md) for the full design and [`PROMPT.md`](./PROMPT.md) for the brief it came from.

## How it works

```
Browser (Svelte app) ──► Cloudflare Worker /api/*  ──► CoinGecko, Binance, CoinPaprika, Kraken, Alternative.me
        │                   ├─ cron every 10 min → KV snapshot (last good data)
        │                   └─ in-memory + edge cache for prices and charts
        └─ if the Worker is unreachable, calls the same public APIs directly
```

| Path | What |
|---|---|
| `src/` | The Svelte 5 app (routes, components, client data layer) |
| `shared/` | API clients, validation, failover — used by both the Worker and the browser |
| `worker/` | The Cloudflare Worker: `/api/snapshot`, `/api/prices`, `/api/candles/:id?range=7d\|30d\|1y`, `/api/health`, and the cron job |
| `tests/unit/` | Vitest tests (formatting, maths, every API client, failover, the Worker) |
| `tests/e2e/` | Playwright tests at 360, 375 and 412 px phone sizes, then desktop, with mocked APIs |

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
```

## Deploying (free, about 15 minutes)

Everything runs on Cloudflare's free plan as one Worker that serves both the app and the API. No credit card needed.

1. Create a free [Cloudflare account](https://dash.cloudflare.com/sign-up).
2. Log in and create the KV namespace that stores the market snapshot:
   ```bash
   npx wrangler login
   npx wrangler kv namespace create SNAPSHOTS
   ```
   Paste the printed `id` into `wrangler.toml` in place of `REPLACE_WITH_KV_NAMESPACE_ID`.
3. Optional but recommended: get a free [CoinGecko Demo API key](https://www.coingecko.com/en/api/pricing) (no card) and store it as a secret. It's never sent to the browser.
   ```bash
   npx wrangler secret put COINGECKO_DEMO_KEY
   ```
4. Deploy:
   ```bash
   npm run deploy
   ```
   Your app is live at `https://cryptoguru.<your-subdomain>.workers.dev`. Check `/api/health` on it.

**Automatic deploys:** add `CLOUDFLARE_API_TOKEN` (a token with the "Edit Cloudflare Workers" template) and `CLOUDFLARE_ACCOUNT_ID` as GitHub repository secrets. Every push to `main` then deploys via `.github/workflows/deploy.yml`.

## Disclaimer

For information only. Not financial, investment, legal or tax advice. Data may be delayed or inaccurate.
