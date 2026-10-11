import type { Adhesion } from '../anatomy/adhesions';
import type { ArachnoidSegment } from '../anatomy/arachnoid';
import * as THREE from 'three';
import type { Hit, ToolBehavior, ToolContext } from './types';

/**
 * Where a bridging vessel cut with the arachnoid bleeds from: the nearest
 * opercular surface (frontal or temporal wall of the fissure) beside the cut.
 */
function fissureWallBelow(hit: Hit, ctx: ToolContext): { point: THREE.Vector3; normal: THREE.Vector3 } | null {
  const lobes = Object.values(ctx.anatomy.brain.lobes).map((g) => g.children[0]);
  const ray = new THREE.Raycaster();
  let best: THREE.Intersection | null = null;
  for (const dir of [new THREE.Vector3(0, 1, -0.6), new THREE.Vector3(0, -1, -0.6)]) {
    ray.set(hit.point, dir.normalize());
    const h = ray.intersectObjects(lobes, false)[0];
    if (h && (!best || h.distance < best.distance)) best = h;
  }
  if (!best?.face) return null;
  return { point: best.point, normal: best.face.normal.clone().transformDirection(best.object.matrixWorld) };
}

/**
 * Micro scissors: sharp opening of arachnoid. Sharp dissection avoids the
 * traction on bridging vessels that tearing would cause. Thin arachnoid bands
 * (PCom veil, dome tether) can also be cut; the neck cuff needs the dissector.
 */
export const scissors: ToolBehavior = {
  id: 'scissors',
  hand: 'right',
  passThrough: [],
  jaw: { pressed: 0, released: 1 },

  classify(hit) {
    if (hit.kind === 'arachnoid') return 'valid';
    if (hit.kind === 'adhesion') return (hit.object.userData.adhesion as Adhesion).sharp ? 'valid' : 'warn';
    if (hit.kind === 'vessel' || hit.kind === 'aneurysm' || hit.kind === 'nerve') return 'warn';
    return 'none';
  },

  press(hit, ctx) {
    if (!hit) return;
    ctx.audio.snip();
    const { state, anatomy } = ctx;
    switch (hit.kind) {
      case 'arachnoid': {
        const seg = hit.object.userData.segment as ArachnoidSegment;
        if (seg.cut) return;
        seg.doCut();
        state.bus.emit('arachnoidCut', { band: seg.band, index: seg.index });
        const band = anatomy.arachnoid.filter((s) => s.band === seg.band);
        state.toast('msg.arachnoidCut', 'good', { n: band.filter((s) => s.cut).length, total: band.length });
        if (seg.bridging) {
          // A small bridging vessel torn with this segment bleeds from the fissure wall.
          const under = fissureWallBelow(hit, ctx);
          if (under) {
            const src = ctx.bleeding.add('ooze', under.point, under.normal, 1.2);
            state.bus.emit('oozeStarted', { id: src.id });
            state.toast('msg.bridgingBleed', 'warn');
          }
        }
        break;
      }
      case 'adhesion': {
        const adh = hit.object.userData.adhesion as Adhesion;
        if (!adh.sharp) {
          ctx.say('msg.useDissector', 'warn');
          return;
        }
        if (adh.advance(1)) {
          state.bus.emit('adhesionFreed', { id: adh.id });
          state.toast('msg.adhesionFreed', 'good', { name: `adhesion.${adh.id}` });
        }
        break;
      }
      case 'vessel':
        state.metrics.unsafeActions++;
        ctx.say('msg.vesselDanger', 'danger');
        break;
      case 'aneurysm':
        state.metrics.unsafeActions++;
        ctx.patient.stressDome(5, hit.point);
        ctx.say('msg.domeDanger', 'danger');
        break;
      case 'nerve':
        state.metrics.unsafeActions++;
        ctx.say('msg.nerveDanger', 'danger');
        break;
    }
  },
};
