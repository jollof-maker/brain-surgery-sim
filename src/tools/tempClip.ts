import { closestT } from '../physics/occlusion';
import { PHYSIO } from '../physics/physiology';
import type { ToolBehavior } from './types';

/** Format seconds as m:ss. */
export function mmss(sec: number): string {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Temporary clip (proximal control). Click the exposed supraclinoid ICA to
 * apply a temporary clip; click the clip again to remove it.
 *  - Proximal to the aneurysm it cuts most of the inflow (rupture control,
 *    softening the dome before final clipping).
 *  - Adding a second clip distal to the aneurysm "traps" it.
 *  - Every minute of occlusion counts: watch the timer and the MEP.
 */
export const tempClip: ToolBehavior = {
  id: 'tempClip',
  hand: 'right',
  passThrough: ['arachnoid', 'adhesion'],
  jaw: { pressed: 1, released: 0.25 },

  classify(hit) {
    if (hit.kind === 'tempClip' || (hit.kind === 'vessel' && hit.id === 'ICA')) return 'valid';
    if (hit.kind === 'vessel' || hit.kind === 'aneurysm' || hit.kind === 'nerve') return 'warn';
    return 'none';
  },

  press(hit, ctx) {
    if (!hit) return;
    const { state, occlusion } = ctx;
    if (hit.kind === 'tempClip' && hit.id) {
      const clip = occlusion.remove(hit.id);
      if (!clip) return;
      const seconds = state.time - clip.appliedAt;
      ctx.audio.clipClick();
      state.bus.emit('tempClipRemoved', { id: clip.id, seconds });
      state.toast('msg.tempClipOff', 'info', { time: mmss(seconds) });
      return;
    }
    if (hit.kind === 'aneurysm') {
      ctx.patient.stressDome(4, hit.point);
      ctx.say('msg.tempNotDome', 'danger');
      return;
    }
    if (hit.kind !== 'vessel') return;
    if (hit.id !== 'ICA') {
      ctx.say('msg.tempIcaOnly', 'warn');
      return;
    }
    if (ctx.anatomy.cutFraction('carotid') < 0.5) {
      ctx.say('msg.notExposed', 'warn', { name: 'struct.ICA' });
      return;
    }
    const t = closestT(ctx.anatomy.vessels.get('ICA')!.curve, hit.point);
    if (occlusion.neckDistance(t) < PHYSIO.tempClip.minNeckDistance) {
      ctx.say('msg.tempTooClose', 'warn');
      return;
    }
    if (occlusion.clips.some((c) => (c.t < occlusion.neckT) === (t < occlusion.neckT))) {
      ctx.say('msg.tempAlready', 'info');
      return;
    }
    const toward = ctx.stage.scope.camera.position.clone().sub(hit.point).normalize();
    const clip = occlusion.apply(t, toward, state.time);
    ctx.audio.clipClick();
    state.bus.emit('tempClipApplied', { id: clip.id, proximal: clip.proximal });
    state.toast(clip.proximal ? 'msg.tempProximal' : 'msg.tempDistal', clip.proximal ? 'good' : 'info');
  },
};
