// Renders the PNG app icons in public/ from the SVG logo. Run: node scripts/make-icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
// Full-bleed square for platforms that apply their own mask (Android "maskable", iOS).
const square = svg.replace(/rx="\d+"/, 'rx="0"');
// Maskable icons may be cut to a circle covering the central 80%: shrink the mark to fit inside it.
const maskable = square.replace(/(<rect[^>]*\/>)([\s\S]*)<\/svg>/, '$1<g transform="translate(76.8 76.8) scale(0.7)">$2</g></svg>');

const icons = [
  { file: 'icon-192.png', size: 192, svg },
  { file: 'icon-512.png', size: 512, svg },
  { file: 'icon-maskable-512.png', size: 512, svg: maskable },
  { file: 'apple-touch-icon.png', size: 180, svg: square },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const icon of icons) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${icon.svg.replace('<svg ', `<svg width="${icon.size}" height="${icon.size}" `)}</body></html>`,
  );
  await page.screenshot({ path: new URL(`../public/${icon.file}`, import.meta.url).pathname, omitBackground: true });
  console.log(`public/${icon.file}`);
}
await browser.close();
