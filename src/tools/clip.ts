import * as THREE from 'three';
import { CLIP_LENGTH } from '../physics/clipEval';
import type { ToolBehavior } from './types';

/**
 * Clip pose controls (shared with the HUD):
 *  depth — how far the blade tips are advanced past the surface you point at (mm);
 *          the blades must reach across the whole neck, but not beyond into what
 *          lies behind it.
 *  roll  — rotation of the blades around the applier axis (deg); the neck must
 *          pass *between* the blades, so they should end up parallel to the parent ICA.
 */
export const clipPose = { depth: 4.5, roll: 0 };
const DEPTH = { min: 1, max: 10, step: 0.5 };
const ROLL_STEP = 15;

/**
 * Permanent aneurysm clip (straight or curved; press 6 again to switch).
 * Point at the neck, set rotation (Q/E) and depth ([ / ]), click to close the
 * clip. Click a placed clip (or Backspace) to remove it and try again. The
 * result is not announced — check it with ICG, Doppler and the endoscope.
 */
export const clip: ToolBehavior = {
  id: 'clip',
  hand: 'right',
  passThrough: ['arachnoid'],
  jaw: { pressed: 1, released: 0.25 },

  classify(hit) {
    if (hit.kind === 'aneurysm' || hit.kind === 'clip') return 'valid';
    if (hit.kind === 'vessel' || hit.kind === 'nerve') return 'warn';
    return 'none';
  },

  adjustPose(pose) {
    // Roll the blades around the shaft, then advance the tips along the approach.
    const q = new THREE.Quaternion().setFromAxisAngle(pose.y, THREE.MathUtils.degToRad(clipPose.roll));
    pose.x.applyQuaternion(q);
    pose.z.applyQuaternion(q);
    pose.tip.addScaledVector(pose.y, -clipPose.depth);
  },

  key(key, ctx) {
    const s = ctx.state;
    switch (key) {
      case 'q': clipPose.roll = (clipPose.roll - ROLL_STEP + 360) % 360; break;
      case 'e': clipPose.roll = (clipPose.roll + ROLL_STEP) % 360; break;
      case '[': clipPose.depth = Math.max(DEPTH.min, clipPose.depth - DEPTH.step); break;
      case ']': clipPose.depth = Math.min(DEPTH.max, clipPose.depth + DEPTH.step); break;
      case 'backspace': {
        const last = ctx.clipping.clips.at(-1);
        if (last) removeClip(last.id, ctx);
        return true;
      }
      default: return false;
    }
    s.bus.emit('clipPoseChanged', { ...clipPose });
    return true;
  },

  press(hit, ctx) {
    if (!hit) return;
    const { state, clipping } = ctx;
    if (hit.kind === 'clip' && hit.id) {
      removeClip(hit.id, ctx);
      return;
    }
    if (hit.kind !== 'aneurysm') {
      ctx.say('msg.clipAimNeck', 'warn');
      return;
    }
    if (clipping.full) {
      ctx.say('msg.clipMax', 'warn');
      return;
    }
    const c = clipping.apply(state.clipVariant, ctx.pose, state.time);
    ctx.audio.clipClick();
    state.toast('msg.clipApplied', 'info', { len: CLIP_LENGTH[state.clipVariant] });
    // What the surgeon feels/sees immediately; the rest is for ICG / Doppler / endoscope.
    if (c.effects.undissected) {
      ctx.patient.stressDome(6, hit.point);
      state.toast('msg.clipUndissected', 'warn');
    }
    if (c.effects.domeClip) {
      ctx.patient.stressDome(10, hit.point);
      state.toast('msg.clipOnDome', 'warn');
    }
    if (c.effects.misaligned) state.toast('msg.clipMisaligned', 'warn');
    if (c.effects.nerveContact) state.toast('msg.clipNerve', 'warn');
    state.bus.emit('clipApplied', { id: c.id });
  },
};

function removeClip(id: string, ctx: Parameters<NonNullable<ToolBehavior['press']>>[1]): void {
  if (!ctx.clipping.remove(id)) return;
  ctx.audio.clipClick();
  ctx.state.metrics.clipRepositions++;
  ctx.state.bus.emit('clipRemoved', { id });
  ctx.state.toast('msg.clipRemoved', 'info');
}
