// M4 scenario (short): open the carotid cistern, force a rupture, suction the pool,
// apply a proximal temporary clip, then check vitals / crisis state.
const frames = (page, n = 2) => page.evaluate((n) => new Promise((res) => {
  const step = (k) => (k <= 0 ? res() : requestAnimationFrame(() => step(k - 1)));
  step(n);
}), n);

const state = (page) => page.evaluate(() => {
  const { bleeding, patient, occlusion, crisis } = window.__sim;
  const v = patient.vitals;
  return {
    pool: +bleeding.poolVolume.toFixed(2), level: +bleeding.poolLevel().toFixed(1), loss: +bleeding.totalLoss.toFixed(1),
    clips: occlusion.clips.map((c) => `${c.id}:${c.proximal ? 'prox' : 'dist'}`), inflow: occlusion.inflow(),
    hr: Math.round(v.hr), bp: `${Math.round(v.sys)}/${Math.round(v.dia)}`, mep: Math.round(v.mep), occ: +v.occlusionSec.toFixed(1),
    crisis: [...crisis.done], alarms: patient.alarms,
  };
});

/** Scans candidate world points; returns the first page point where the active tool hits `kind`/`id`. */
const findHit = (page, pts, kind, id) => page.evaluate(([pts, kind, id]) => {
  const { stage, tools } = window.__sim;
  const r = stage.renderer.domElement.getBoundingClientRect();
  for (const [x, y, z] of pts) {
    const v = new stage.scope.camera.position.constructor(x, y, z).project(stage.scope.camera);
    const p = { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    const h = tools.probeAt(p.x, p.y);
    if (h && h.kind === kind && (!id || h.id === id)) return p;
  }
  return null;
}, [pts, kind, id]);

export default async function ({ page, shot, toClient }) {
  const log = {};
  await page.evaluate(() => {
    const { anatomy, state } = window.__sim;
    for (const s of anatomy.arachnoid) s.doCut();
    for (const l of ['frontal', 'temporal']) state.retraction[l] = { value: 0.7, seated: true };
    window.__sim.patient.forceRupture();
  });
  await frames(page, 25);
  await shot('rupture');
  log.afterRupture = await state(page);

  // Suction: hold the tip where the pool surface is visible.
  await page.keyboard.press('1');
  await frames(page, 2);
  const level = await page.evaluate(() => window.__sim.bleeding.poolLevel());
  const grid = [];
  for (let r = 4; r < 20; r += 3) for (let a = 0; a < 12; a++) grid.push([4 + r * Math.cos(a * 0.52), -2 + r * Math.sin(a * 0.52), level]);
  const sp = await findHit(page, grid, 'blood', 'pool');
  log.poolPoint = !!sp;
  if (sp) await page.mouse.move(sp.x, sp.y);
  await frames(page, 2);
  await page.mouse.down();
  await frames(page, 40);
  await page.mouse.up();
  log.afterSuction = await state(page);

  // Temporary clip on a visible part of the proximal ICA.
  await page.keyboard.press('0');
  await frames(page, 2);
  const icaPts = await page.evaluate(() => {
    const { anatomy, occlusion, stage } = window.__sim;
    const ica = anatomy.vessels.get('ICA');
    const out = [];
    for (let t = 0.05; t < occlusion.neckT - 0.06; t += 0.02) {
      const c = ica.curve.getPointAt(t);
      const toCam = stage.scope.camera.position.clone().sub(c).normalize();
      out.push(c.addScaledVector(toCam, ica.radiusAt(t) * 0.8).toArray());
    }
    return out;
  });
  const p = (await findHit(page, icaPts, 'vessel', 'ICA')) ?? { x: 0, y: 0 };
  await page.mouse.move(p.x, p.y);
  await frames(page, 3);
  log.probe = await page.evaluate(([x, y]) => window.__sim.tools.probeAt(x, y), [p.x, p.y]);
  await page.mouse.down();
  await frames(page, 2);
  await page.mouse.up();
  await frames(page, 20);
  await shot('temp-clip');
  log.afterClip = await state(page);
  return log;
}
