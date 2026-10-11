import * as THREE from 'three';
import type { LobeId } from '../core/SimState';
import { retractionLimit } from '../physics/retraction';
import type { ToolBehavior } from './types';

/**
 * Brain spatula: holds a lobe gently once the fissure has been opened.
 * The spatula should keep what dissection has gained, not create the opening
 * by force — pulling against intact arachnoid stretches the cortex and
 * bridging veins. Pulling beyond the limit is recorded as overload.
 */
let active: LobeId | null = null;

function lobeOf(obj: THREE.Object3D): LobeId | null {
  const id = obj.userData.id;
  return id === 'frontal' || id === 'temporal' ? id : null;
}

export const spatula: ToolBehavior = {
  id: 'spatula',
  hand: 'right',
  passThrough: ['arachnoid', 'adhesion'],

  classify(hit) {
    return (hit.kind === 'brain' || hit.kind === 'spatula') && lobeOf(hit.object) ? 'valid' : 'none';
  },

  press(hit, ctx) {
    active = hit && (hit.kind === 'brain' || hit.kind === 'spatula') ? lobeOf(hit.object) : null;
    if (!active) return;
    const r = ctx.state.retraction[active];
    if (!r.seated) {
      r.seated = true;
      ctx.anatomy.spatulas.get(active)!.visible = true;
      ctx.state.bus.emit('spatulaPlaced', { lobe: active });
      ctx.state.toast('msg.spatulaSeated', 'good', { lobe: `lobe.${active}` });
    }
  },

  hold(p, ctx) {
    if (!active) return;
    // Screen direction in which this lobe moves away from the fissure.
    const cam = ctx.stage.scope.camera;
    const a = ctx.stage.scope.target.clone().project(cam);
    const b = ctx.stage.scope.target.clone().add(new THREE.Vector3(0, active === 'frontal' ? 1 : -1, 0)).project(cam);
    const dir = new THREE.Vector2(b.x - a.x, -(b.y - a.y)).normalize(); // to CSS px orientation
    const r = ctx.state.retraction[active];
    const limit = retractionLimit(ctx.anatomy.cutFraction('sylvian'));
    const want = r.value + p.screenDelta.dot(dir) / 260;
    if (want > limit) {
      ctx.state.metrics.retractionOverload += want - limit;
      ctx.say('msg.tethered', 'warn');
    }
    r.value = THREE.MathUtils.clamp(want, 0, limit);
  },

  release() {
    active = null;
  },
};
