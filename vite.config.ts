import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
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
