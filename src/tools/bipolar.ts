import type { ToolBehavior } from './types';

/** Seconds of contact needed to seal a small bleeding point. */
const COAG_TIME = 0.6;
/** Bipolar tips grab tissue within this distance (mm) of the bleeding point. */
const REACH = 2.5;

/**
 * Bipolar forceps: current passes only between the two tips, so small
 * bleeding points can be sealed precisely. Never coagulate on the dome or a
 * major artery — heat shrinks and weakens the wall.
 */
let vesselContact = 0;

export const bipolar: ToolBehavior = {
  id: 'bipolar',
  hand: 'right',
  passThrough: ['arachnoid'],
  jaw: { pressed: 0, released: 1 },

  classify(hit, ctx) {
    if (ctx.bleeding.nearest(hit.point, REACH)) return 'valid';
    if (hit.kind === 'vessel' || hit.kind === 'aneurysm' || hit.kind === 'nerve') return 'warn';
    return 'none';
  },

  press(_hit, ctx) {
    vesselContact = 0;
    ctx.audio.setLoop('bipolar', true);
  },

  hold(p, ctx) {
    if (!p.hit) return;
    const src = ctx.bleeding.nearest(p.hit.point, REACH);
    if (src && src.active) {
      src.coag += p.dt;
      if (src.coag >= COAG_TIME) {
        ctx.bleeding.coagulate(src);
        ctx.state.bus.emit('oozeStopped', { id: src.id });
        ctx.state.toast('msg.coagulated', 'good');
      }
      return;
    }
    if (p.hit.kind === 'aneurysm') {
      ctx.state.metrics.domeStress += p.dt * 2;
      ctx.say('msg.domeDanger', 'danger');
    } else if (p.hit.kind === 'vessel' || p.hit.kind === 'nerve') {
      vesselContact += p.dt;
      if (vesselContact > 0.3) {
        ctx.state.metrics.unsafeActions++;
        vesselContact = -1e9; // count once per press
        ctx.say(p.hit.kind === 'vessel' ? 'msg.vesselDanger' : 'msg.nerveDanger', 'danger');
      }
    }
  },

  release(ctx) {
    ctx.audio.setLoop('bipolar', false);
  },
};
