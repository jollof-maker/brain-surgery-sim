import * as THREE from 'three';
import { ANATOMY } from './config';
import { Materials } from './materials';
import { buildTube } from './tube';

export type NerveId = 'optic' | 'oculomotor';

/**
 * Cranial nerves seen in this exposure:
 *  - Optic nerve (CN II): the white, flattened landmark medial to the ICA.
 *    Finding it (with the ICA lateral to it) orients you in the carotid cistern.
 *  - Oculomotor nerve (CN III): deep, running forward toward the cavernous
 *    sinus roof. A posterolaterally/inferiorly pointing IC-PC aneurysm can
 *    press on it (third-nerve palsy: ptosis, dilated pupil).
 */
export function buildNerves(): { group: THREE.Group; nerves: Map<NerveId, THREE.Mesh> } {
  const group = new THREE.Group();
  group.name = 'nerves';
  const nerves = new Map<NerveId, THREE.Mesh>();
  for (const id of ['optic', 'oculomotor'] as const) {
    const cfg = ANATOMY.nerves[id];
    const curve = new THREE.CatmullRomCurve3(cfg.points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
    const geo = buildTube(curve, () => cfg.radius, { flatten: cfg.flatten, capStart: true, capEnd: true, tubularSegments: 80, radialSegments: 28 });
    const mesh = new THREE.Mesh(geo, Materials.nerve());
    mesh.name = id;
    mesh.userData = { kind: 'nerve', id };
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    nerves.set(id, mesh);
  }
  return { group, nerves };
}
