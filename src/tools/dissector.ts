import type { Adhesion } from '../anatomy/adhesions';
import { ANATOMY } from '../anatomy/config';
import type { ToolBehavior } from './types';

/**
 * Micro dissector: blunt dissection of the tissue around the aneurysm neck.
 * Work in small, slow strokes on the PARENT ARTERY side of the neck, never by
 * pushing on the dome. Fast strokes are counted as rough handling.
 */
export const dissector: ToolBehavior = {
  id: 'dissector',
  hand: 'right',
  passThrough: [],

  classify(hit) {
    if (hit.kind === 'adhesion') return 'valid';
    if (hit.kind === 'aneurysm' || hit.kind === 'arachnoid') return 'warn';
    return 'none';
  },

  press(hit, ctx) {
    if (hit?.kind === 'arachnoid') ctx.say('msg.useScissorsFirst', 'warn');
  },

  hold(p, ctx) {
    const hit = p.hit;
    if (!hit) return;
    const stroke = p.tipDelta.length();
    const speed = stroke / Math.max(p.dt, 1e-3);
    const rough = speed > ANATOMY.adhesions.roughSpeed;
    if (hit.kind === 'adhesion') {
      const adh = hit.object.userData.adhesion as Adhesion;
      let amount = stroke / ANATOMY.adhesions.strokeToFree;
      if (rough) {
        ctx.state.metrics.roughDissection += p.dt;
        // Tugging on tissue attached to the dome transmits force to the wall.
        if (adh.id === 'domeTether' || adh.id.startsWith('neck')) ctx.state.metrics.domeStress += stroke * 0.15;
        ctx.say('msg.tooFast', 'warn');
        amount *= 0.4;
      }
      if (adh.advance(amount)) {
        ctx.state.bus.emit('adhesionFreed', { id: adh.id });
        ctx.state.toast('msg.adhesionFreed', 'good', { name: `adhesion.${adh.id}` });
      }
    } else if (hit.kind === 'aneurysm') {
      ctx.state.metrics.domeStress += stroke * (rough ? 0.8 : 0.3);
      if (stroke > 0.01) ctx.say('msg.domeDanger', 'danger');
    }
  },
};
