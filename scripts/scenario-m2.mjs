// M2 scenario: open the fissure, coagulate oozing, retract, open the carotid cistern, dissect the neck.
const wait = (page, ms) => page.waitForTimeout(ms);
/** Wait for n rendered frames (headless software rendering can be slow). */
const frames = (page, n = 2) => page.evaluate((n) => new Promise((res) => {
  const step = (k) => (k <= 0 ? res() : requestAnimationFrame(() => step(k - 1)));
  step(n);
}), n);

/** Screen point where the active tool reaches the named object first (null if hidden). */
const reach = (page, name) => page.evaluate((n) => {
  const { stage, tools } = window.__sim;
  const obj = stage.scene.getObjectByName(n);
  return obj ? tools.findReachablePoint(obj) : null;
}, name);

async function click(page, p, holdFrames = 2) {
  await page.mouse.move(p.x, p.y);
  await frames(page);
  await page.mouse.down();
  await frames(page, holdFrames);
  await page.mouse.up();
  await frames(page);
}

async function tool(page, key) {
  await page.keyboard.press(key);
  await wait(page, 200);
}

export default async function ({ page, shot, toClient }) {
  const log = [];

  // 1. Scissors on the sylvian arachnoid
  await tool(page, '2');
  for (let i = 0; i < 6; i++) {
    const p = await reach(page, `arachnoid-sylvian-${i}`);
    if (!p) { log.push(`sylvian-${i} unreachable`); continue; }
    if (i === 0) { await page.mouse.move(p.x, p.y); await wait(page, 500); await shot('scissors-hover'); }
    await click(page, p);
  }
  await wait(page, 1500);
  await shot('sylvian-opened');

  // 2. Bipolar on each ooze
  await tool(page, '3');
  const oozes = await page.evaluate(() => window.__sim.bleeding.sources.map((s) => [s.position.x, s.position.y, s.position.z]));
  for (const o of oozes) await click(page, await toClient(o), 30);

  // 3. Spatula: seat on both lobes and retract away from the fissure
  await tool(page, '5');
  for (const [lobe, dy] of [['frontal', -1], ['temporal', 1]]) {
    // Walk from the field centre toward the lobe until the spatula ray lands on it, then go a bit further in.
    const p = await page.evaluate(([lobe, dy]) => {
      const { tools } = window.__sim;
      const cx = innerWidth / 2, cy = innerHeight / 2;
      for (let d = 0; d < cy; d += 6) {
        const h = tools.probeAt(cx, cy + dy * d);
        if (h?.kind === 'brain' && h.id === lobe) return { x: cx, y: cy + dy * (d + 25) };
      }
      return null;
    }, [lobe, dy]);
    if (!p) { log.push(`${lobe} unreachable`); continue; }
    await page.mouse.move(p.x, p.y);
    await wait(page, 200);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(p.x, p.y + dy * i * 10); await frames(page, 1); }
    await page.mouse.up();
  }
  await wait(page, 800);
  await shot('retracted');

  // 4. Scissors on the carotid cistern arachnoid
  await tool(page, '2');
  for (let i = 0; i < 4; i++) {
    const p = await reach(page, `arachnoid-carotid-${i}`);
    if (!p) { log.push(`carotid-${i} unreachable`); continue; }
    await click(page, p);
  }
  await wait(page, 1500);
  await shot('carotid-opened');

  // 5. Tilt laterally to see the neck, then dissect the proximal cuff with slow strokes.
  await page.evaluate(() => {
    const { stage, anatomy } = window.__sim;
    const a = anatomy.aneurysm;
    stage.scope.focusOn(a.base.clone().addScaledVector(a.axis, 2.5));
    stage.scope.goalField = 16;
    stage.scope.goalTilt.set(0.5, -0.1);
  });
  await wait(page, 1500);
  await tool(page, '4');
  for (const id of ['neckProximal', 'neckDistal']) {
    const p = await reach(page, `adhesion-${id}`);
    if (!p) { log.push(`${id} unreachable`); continue; }
    await page.mouse.move(p.x, p.y);
    await wait(page, 300);
    if (id === 'neckProximal') await shot('dissector-hover');
    await page.mouse.down();
    for (let i = 0; i < 80; i++) { await page.mouse.move(p.x + Math.sin(i / 2) * 8, p.y + Math.cos(i / 3) * 5); await frames(page, 1); }
    await page.mouse.up();
  }
  await wait(page, 800);
  await shot('after-dissection');

  return page.evaluate((log) => {
    const { state, anatomy, bleeding } = window.__sim;
    return {
      log,
      sylvianCut: anatomy.cutFraction('sylvian'),
      carotidCut: anatomy.cutFraction('carotid'),
      oozes: bleeding.sources.map((s) => `${s.active ? 'active' : 'stopped'} @${s.position.toArray().map((v) => v.toFixed(1))}`),
      retraction: Object.fromEntries(Object.entries(state.retraction).map(([k, v]) => [k, `${v.value.toFixed(2)} seated=${v.seated}`])),
      adhesions: [...anatomy.adhesions.values()].map((a) => `${a.id} ${a.progress.toFixed(2)}${a.freed ? ' FREED' : ''}`),
      metrics: state.metrics,
    };
  }, log);
}
