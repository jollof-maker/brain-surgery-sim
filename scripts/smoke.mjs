// Smoke test: starts the Vite dev server, opens the app in headless Edge/Chrome,
// clicks "Begin", collects console errors and saves screenshots.
// Usage: node scripts/smoke.mjs [outDir]   (env: SMOKE_SCRIPT=scenario.mjs, SMOKE_EVAL=js-expression)
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
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

const page = await browser.newPage({ viewport: process.env.SMOKE_SCRIPT ? { width: 1200, height: 750 } : { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

// Scenario runs use low quality: headless software rendering is very slow at full quality.
await page.goto(process.env.SMOKE_SCRIPT ? `${url}?quality=low` : url, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${outDir}/01-start.png` });
await page.click('#begin');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${outDir}/02-field.png` });

// Optional scripted scenario: SMOKE_SCRIPT=path/to/scenario.mjs exporting
// `default async ({ page, shot, toClient }) => summary`.
if (process.env.SMOKE_SCRIPT) {
  const mod = await import(pathToFileURL(resolve(process.env.SMOKE_SCRIPT)).href);
  let n = 10;
  const shot = (name) => page.screenshot({ path: `${outDir}/${n++}-${name}.png` });
  // World (mm) → page pixel coordinates through the microscope camera.
  const toClient = (p) => page.evaluate(([x, y, z]) => {
    const { stage } = window.__sim;
    const v = new stage.scope.camera.position.constructor(x, y, z).project(stage.scope.camera);
    const r = stage.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, p);
  const summary = await mod.default({ page, shot, toClient });
  console.log('scenario:', JSON.stringify(summary, null, 1));
}

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
