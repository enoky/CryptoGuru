import { createHash } from 'node:crypto';
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

export default defineConfig({
  plugins: [svelte(), tailwindcss(), serviceWorker(), cookielessAnalytics()],
  build: { target: 'es2022' },
  server: {
    // `npm run worker:dev` serves the API on 8787; the Vite dev server proxies to it.
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
