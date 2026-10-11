import { PHYSIO } from '../physics/physiology';
import type { ToolBehavior } from './types';

/**
 * Suction (left hand). Keeps the field dry: aspirates blood and CSF.
 * Low suction near the dome is still risky — the wall can be pulled into the
 * tip and torn — so contact with the aneurysm counts as dome stress.
 */
export const suction: ToolBehavior = {
  id: 'suction',
  hand: 'left',
  passThrough: ['arachnoid', 'adhesion'],

  classify(hit, ctx) {
    if (hit.kind === 'blood' || ctx.bleeding.nearest(hit.point, 3)) return 'valid';
    if (hit.kind === 'aneurysm') return 'warn';
    return 'none';
  },

  press(_hit, ctx) {
    ctx.audio.setLoop('suction', true);
  },

  hold(p, ctx) {
    if (!p.hit) return;
    ctx.bleeding.suction(p.hit.point, PHYSIO.suction.radius, p.dt);
    // Aspirating at a rupture site is expected; anywhere else on the dome it is not.
    const atRupture = ctx.bleeding.nearest(p.hit.point, 3)?.type === 'arterial';
    if (p.hit.kind === 'aneurysm' && !atRupture) {
      ctx.patient.stressDome(p.dt * 0.5, p.hit.point);
      ctx.say('msg.suctionDome', 'warn');
    }
  },

  release(ctx) {
    ctx.audio.setLoop('suction', false);
  },
};
