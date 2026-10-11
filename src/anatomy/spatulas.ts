import * as THREE from 'three';
import { ANATOMY } from './config';
import { Materials } from './materials';

/**
 * Brain spatulas (self-retaining retractor blades). They gently hold the
 * frontal and temporal lobes apart once the arachnoid has been opened —
 * the fissure should be opened by dissection, not by force on the spatula.
 */
function bladeGeometry(width: number, length: number): THREE.BufferGeometry {
  const r = width / 2;
  const shape = new THREE.Shape();
  // Rounded tip at y = 0, blade extends to y = length.
  shape.moveTo(-r, length);
  shape.lineTo(-r, r);
  shape.absarc(0, r, r, Math.PI, 0, false);
  shape.lineTo(r, length);
  shape.lineTo(-r, length);
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.35, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 2, curveSegments: 24,
  });
}

export function buildSpatulas(): { group: THREE.Group; spatulas: Map<string, THREE.Mesh> } {
  const group = new THREE.Group();
  group.name = 'spatulas';
  const spatulas = new Map<string, THREE.Mesh>();
  for (const s of ANATOMY.spatulas) {
    const mesh = new THREE.Mesh(bladeGeometry(s.width, s.length), Materials.spatula());
    // Blade frame: local +Y along the handle, local +Z = blade normal facing away from the lobe.
    const h = new THREE.Vector3(...s.handleDir).normalize();
    const toLobe = new THREE.Vector3(0, s.id === 'frontal' ? 1 : -1, 0);
    const nrm = toLobe.clone().addScaledVector(h, -toLobe.dot(h)).normalize().negate();
    const x = new THREE.Vector3().crossVectors(h, nrm).normalize();
    mesh.matrix.makeBasis(x, h, nrm).setPosition(new THREE.Vector3(...s.tip));
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.name = `spatula-${s.id}`;
    mesh.userData = { kind: 'spatula', id: s.id };
    mesh.castShadow = true;
    group.add(mesh);
    spatulas.set(s.id, mesh);
  }
  return { group, spatulas };
}
