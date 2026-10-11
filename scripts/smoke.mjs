// Smoke test: starts the Vite dev server, opens the app in headless Edge/Chrome,
// clicks "Begin", collects console errors and saves screenshots.
// Usage: node scripts/smoke.mjs [outDir] [--keep]
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const outDir = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'smoke-out');
mkdirSync(outDir, { recursive: true });

const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];

let browser;
for (const channel of ['msedge', 'chrome']) {
  try {
    browser = await chromium.launch({ channel, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    break;
  } catch { /* try next */ }
}
if (!browser) throw new Error('No Edge/Chrome found for smoke test');

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/01-start.png` });
await page.click('#begin');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outDir}/02-field.png` });

// Optional extra step hook for milestone-specific checks.
const extra = process.env.SMOKE_EVAL;
if (extra) {
  const result = await page.evaluate(extra);
  console.log('eval:', JSON.stringify(result));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${outDir}/03-after-eval.png` });
}

console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
await server.close();
process.exit(errors.some((e) => !e.startsWith('[warning]')) ? 1 : 0);
