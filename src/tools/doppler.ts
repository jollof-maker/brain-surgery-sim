import type { FlowTarget } from '../physics/flow';
import type { ToolBehavior } from './types';

/** Seconds of steady contact before a reading counts as a check. */
const CHECK_SEC = 1;

let target: FlowTarget | null = null;
let held = 0;
let checked = false;

/**
 * Micro-Doppler probe: touch a vessel to hear its flow. The pitch rises with
 * velocity (a narrowed artery "whistles"), the loudness with flow; silence
 * means no flow. Touching a vessel also identifies it. After clipping, hold
 * the probe on the PCom, the AChA and the dome to check the result.
 */
export const doppler: ToolBehavior = {
  id: 'doppler',
  hand: 'right',
  passThrough: ['arachnoid'],

  classify(hit) {
    return hit.kind === 'vessel' || hit.kind === 'aneurysm' ? 'valid' : 'none';
  },

  press(hit, ctx) {
    held = 0;
    checked = false;
    target = null;
    ctx.audio.setLoop('doppler', true);
    if (hit?.kind === 'vessel' && hit.id) ctx.identify(hit.id);
  },

  hold(p, ctx) {
    const hit = p.hit;
    const t: FlowTarget | null = hit?.kind === 'aneurysm' ? 'aneurysm'
      : hit?.kind === 'vessel' && hit.id ? (hit.id as FlowTarget) : null;
    if (t !== target) {
      target = t;
      held = 0;
      checked = false;
    }
    const flow = t ? ctx.clipping.flow[t] : 0;
    // A stenosis speeds blood up: higher Doppler shift.
    const velocity = t === 'ICA' ? 1 / Math.max(0.3, 1 - ctx.clipping.effects.icaNarrowing) : t === 'aneurysm' ? 0.45 : 1;
    ctx.audio.setDoppler(flow, velocity, ctx.state.pulse);
    ctx.state.doppler = t ? { target: t, flow } : null;
    if (!t) return;
    if (t === 'aneurysm') ctx.patient.stressDome(p.dt * 0.2, hit!.point);
    held += p.dt;
    if (!checked && held >= CHECK_SEC) {
      checked = true;
      ctx.clipping.dopplerCheck(t);
    }
  },

  release(ctx) {
    ctx.audio.setLoop('doppler', false);
    ctx.state.doppler = null;
    target = null;
  },
};
