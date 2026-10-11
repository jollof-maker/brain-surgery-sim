// M6 scenario (short): run the demo for a while, report progress, then take over and open the debrief.
const frames = (page, n = 2) => page.evaluate((n) => new Promise((res) => {
  const step = (k) => (k <= 0 ? res() : requestAnimationFrame(() => step(k - 1)));
  step(n);
}), n);
const progress = (page) => page.evaluate(() => {
  const { machine, demo, state } = window.__sim;
  return { stage: machine.current + 1, done: machine.done.map((s) => s.size), demo: demo.active, tool: state.tool,
    caption: document.querySelector('#demo-caption .text').textContent.slice(0, 50) };
});

export default async function ({ page, shot }) {
  const log = [];
  await page.evaluate(() => window.__sim.demo.start());
  const t0 = Date.now();
  for (let i = 0; i < 5; i++) {
    await frames(page, 40);
    log.push({ s: Math.round((Date.now() - t0) / 1000), ...(await progress(page)) });
    if (i === 2) await shot('demo');
    if (!log.at(-1).demo) break;
  }
  await shot('demo-late');
  await page.keyboard.press('Escape'); // take over
  await frames(page, 3);
  log.push({ afterTakeover: await progress(page) });
  await page.click('#debrief-open');
  await frames(page, 3);
  await shot('debrief');
  return log;
}
