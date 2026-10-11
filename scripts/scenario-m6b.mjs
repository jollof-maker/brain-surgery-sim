// Quick check: top bar fits between the panels; the demo's spatula step seats both spatulas.
export default async function ({ page, shot }) {
  const rects = await page.evaluate(() => Object.fromEntries(['checklist', 'topbar', 'vitals'].map((id) => {
    const r = document.getElementById(id).getBoundingClientRect();
    return [id, [Math.round(r.left), Math.round(r.right)]];
  })));
  const seated = await page.evaluate(async () => {
    const { demo, tools, state, anatomy } = window.__sim;
    for (const s of anatomy.arachnoid.filter((s) => s.band === 'sylvian')) s.doCut();
    demo.active = true;
    tools.setVirtual(true);
    state.setTool('spatula');
    await demo.seatSpatula('frontal');
    await demo.seatSpatula('temporal');
    demo.active = false;
    tools.setVirtual(false);
    return { f: state.retraction.frontal, t: state.retraction.temporal };
  });
  await shot('spatulas');
  return { rects, seated };
}
