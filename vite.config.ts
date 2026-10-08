import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

/**
 * Writes dist/sw.js from src/sw/sw.template.js with the list of files to keep
 * offline: the page, every built JS/CSS file, and the icons and manifest.
 */
function serviceWorker(): Plugin {
  return {
    name: 'cryptoguru-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => /\.(js|css)$/.test(f));
      const fromPublic = readdirSync('public').filter((f) => /\.(png|svg|webmanifest)$/.test(f));
      const files = ['/', ...[...built, ...fromPublic].sort().map((f) => `/${f}`)];
      // Any change to any file (including index.html) gives a new version, so phones fetch the update.
      const hash = createHash('sha256').update(files.join('\n'));
      for (const item of Object.values(bundle)) hash.update(item.type === 'chunk' ? item.code : item.source);
      for (const f of fromPublic) hash.update(readFileSync(`public/${f}`));
      hash.update(readFileSync('index.html'));
      const version = hash.digest('hex').slice(0, 12);
      const source = readFileSync('src/sw/sw.template.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(files, null, 2));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

/**
 * Optional, off by default: Cloudflare Web Analytics (no cookies, no personal
 * data). Turned on by building with VITE_CF_ANALYTICS_TOKEN set to the site's
 * token from the Cloudflare dashboard.
 */
function cookielessAnalytics(): Plugin {
  const token = process.env.VITE_CF_ANALYTICS_TOKEN ?? '';
  return {
    name: 'cryptoguru-analytics',
    transformIndexHtml() {
      if (!token) return [];
      if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('VITE_CF_ANALYTICS_TOKEN should be the 32-character token from Cloudflare Web Analytics');
      return [
        {
          tag: 'script',
          attrs: { defer: true, src: 'https://static.cloudflareinsights.com/beacon.min.js', 'data-cf-beacon': JSON.stringify({ token }) },
          injectTo: 'body',
        },
      ];
    },
  };
}

/**
 * MOCK_API=1 answers /api from deterministic fake data (tests/fixtures/mockData.ts),
 * in both `vite` and `vite preview`. Used by Lighthouse CI, and handy for trying
 * the app with no network. Coin logos are left out so nothing leaves the machine.
 */
function mockApi(): Plugin {
  const enabled = process.env.MOCK_API === '1';
  const install = async (server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) => {
    if (!enabled) return;
    const { createMockApi, makeSnapshot } = await import('./tests/fixtures/mockData');
    const snapshot = makeSnapshot();
    for (const a of snapshot.markets!.data) a.image = null;
    for (const t of snapshot.trending!.data) t.image = null;
    const answer = createMockApi({ snapshot });
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next();
      const { status, body } = answer(new URL(req.url, 'http://localhost'));
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      // Compressed like Cloudflare does in production, so Lighthouse times realistic downloads.
      const raw = Buffer.from(JSON.stringify(body));
      if (/\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
        res.setHeader('content-encoding', 'gzip');
        res.end(gzipSync(raw));
      } else res.end(raw);
    });
  };
  return { name: 'cryptoguru-mock-api', configureServer: install, configurePreviewServer: install };
}

export default defineConfig({
  plugins: [svelte(), tailwindcss(), serviceWorker(), cookielessAnalytics(), mockApi()],
  build: { target: 'es2022' },
  server: {
    // `npm run worker:dev` serves the API on 8787; the Vite dev server proxies to it (unless MOCK_API=1).
    proxy: process.env.MOCK_API === '1' ? {} : { '/api': 'http://localhost:8787' },
  },
  preview: { proxy: process.env.MOCK_API === '1' ? {} : { '/api': 'http://localhost:8787' } },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
