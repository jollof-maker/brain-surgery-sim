// M5 scenario (short): expose and dissect, clip the neck with the clip tool,
// run ICG, park the endoscope, and report the clip evaluation and flags.
const frames = (page, n = 2) => page.evaluate((n) => new Promise((res) => {
  const step = (k) => (k <= 0 ? res() : requestAnimationFrame(() => step(k - 1)));
  step(n);
}), n);

/** First candidate world point where the active tool's ray hits `kind`. */
const findHit = (page, pts, kind) => page.evaluate(([pts, kind]) => {
  const { stage, tools } = window.__sim;
  const r = stage.renderer.domElement.getBoundingClientRect();
  for (const [x, y, z] of pts) {
    const v = new stage.scope.camera.position.constructor(x, y, z).project(stage.scope.camera);
    const p = { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    const h = tools.probeAt(p.x, p.y);
    if (h && h.kind === kind) return p;
  }
  return null;
}, [pts, kind]);

const report = (page) => page.evaluate(() => {
  const { clipping, state } = window.__sim;
  const e = clipping.effects;
  const r = (v) => +v.toFixed(2);
  return {
    clips: clipping.clips.length, closure: r(e.neckClosure), residual: r(e.residualNeck), narrowing: r(e.icaNarrowing),
    branches: e.branches, flags: [...state.flags], flow: Object.fromEntries(Object.entries(clipping.flow).map(([k, v]) => [k, r(v)])),
  };
});

export default async function ({ page, shot }) {
  const log = {};
  await page.evaluate(() => {
    const { anatomy, state } = window.__sim;
    for (const s of anatomy.arachnoid) s.doCut();
    for (const a of anatomy.adhesions.values()) a.advance(1);
    for (const l of ['frontal', 'temporal']) state.retraction[l] = { value: 0.7, seated: true };
  });
  await page.keyboard.press('6');
  await frames(page, 3);

  // Candidate aim points: around the neck just above the ICA wall, on the side facing the scope.
  const pts = await page.evaluate(() => {
    const { clipping, stage } = window.__sim;
    const T = clipping.targets;
    const cam = stage.scope.camera.position;
    const out = [];
    for (const ds of [0.4, 0.8, 1.2]) {
      const c = T.base.clone().addScaledVector(T.axis, T.sWall + ds);
      const toCam = cam.clone().sub(c).normalize();
      const radial = toCam.addScaledVector(T.axis, -toCam.dot(T.axis)).normalize();
      for (const lat of [0, -0.6, 0.6]) {
        const side = radial.clone().cross(T.axis).normalize();
        out.push(c.clone().addScaledVector(radial, T.profile.neckR * 0.95).addScaledVector(side, lat).toArray());
      }
    }
    return out;
  });
  const p = await findHit(page, pts, 'aneurysm');
  log.aim = !!p;
  if (p) {
    await page.mouse.move(p.x, p.y);
    await frames(page, 3);
    // Rotate (Q/E) until the neck lies between the blades, as the learner would.
    for (let i = 0; i < 24; i++) {
      const c = await page.evaluate(() => {
        const { clipping, state, tools } = window.__sim;
        return clipping.preview(state.clipVariant, tools['ctx'].pose).neckClosure;
      });
      if (c > 0.95) { log.rollSteps = i; break; }
      await page.keyboard.press('e');
      await frames(page, 2);
    }
    await shot('clip-aim');
    await page.mouse.down();
    await frames(page, 2);
    await page.mouse.up();
    await frames(page, 4);
    await page.mouse.move(p.x + 160, p.y - 120);
    await frames(page, 3);
    await shot('clip-applied');
  }
  log.afterClip = await report(page);

  // Endoscope: park it beside the aneurysm on the brain/floor.
  await page.keyboard.press('9');
  await frames(page, 2);
  const ep = await page.evaluate(() => {
    const { clipping } = window.__sim;
    const b = clipping.targets.base;
    const out = [];
    for (let a = 0; a < 16; a++) for (const r of [8, 11]) out.push([b.x + r * Math.cos(a * 0.39), b.y + r * Math.sin(a * 0.39), b.z - 2]);
    return out;
  });
  const hit = (await findHit(page, ep, 'brain')) ?? (await findHit(page, ep, 'floor'));
  if (hit) {
    await page.mouse.click(hit.x, hit.y);
    await frames(page, 25);
  }
  await page.keyboard.press('4');
  await frames(page, 3);
  await shot('endoscope');
  log.endoscope = !!hit;
  log.afterEndo = (await report(page)).flags;
  // ICG
  await page.keyboard.press('7');
  await frames(page, 2);
  await page.mouse.click(600, 375);
  await frames(page, 30);
  await shot('icg');
  await frames(page, 40);
  log.afterIcg = await report(page);

  log.final = await report(page);
  return log;
}
