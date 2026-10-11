import * as THREE from 'three';
import { computeBoundsTree } from 'three-mesh-bvh';
import { ANATOMY, type Vec3 } from './config';
import { Materials } from './materials';
import { fbm3, noise3 } from './noise';
import type { LobeId } from '../core/SimState';


/**
 * A lobe is a superellipsoid sculpted with gyri and sulci. Sulci are the narrow
 * grooves where a noise field crosses zero; gyri are the rounded crowns
 * between them. In this view the frontal lobe's orbital surface lies over the
 * optic nerve, and the temporal lobe (with the uncus) lies posterior/inferior.
 */
function buildLobe(id: LobeId, center: Vec3, radii: Vec3, exponent: number): THREE.Mesh {
  const { gyriAmplitude: amp, gyriFrequency: freq } = ANATOMY.brain;
  const geo = new THREE.SphereGeometry(1, 192, 144);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const n = new THREE.Vector3(), m = new THREE.Vector3(), p = new THREE.Vector3(), en = new THREE.Vector3();
  const r = new THREE.Vector3(...radii);
  const c = new THREE.Vector3(...center);
  const seed = id === 'frontal' ? 0 : 50;
  // Superellipsoid mapping of the unit sphere: m_i = sign(n_i)·|n_i|^(2/e).
  const sp = (x: number) => Math.sign(x) * Math.pow(Math.abs(x), 2 / exponent);
  // Implicit-surface gradient gives the outward normal used for the gyri displacement.
  const gr = (x: number, rad: number) => (Math.sign(x) * Math.pow(Math.abs(x), exponent - 1)) / rad;

  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(pos, i);
    m.set(sp(n.x), sp(n.y), sp(n.z));
    p.copy(m).multiply(r).add(c);
    en.set(gr(m.x, r.x), gr(m.y, r.y), gr(m.z, r.z));
    if (en.lengthSq() < 1e-12) en.copy(n);
    en.normalize();
    const q = p.clone().multiplyScalar(freq);
    const d = Math.abs(noise3(q.x + seed, q.y, q.z));
    const sulcus = THREE.MathUtils.smoothstep(d, 0, 0.22) - 1; // -1 in the groove, 0 on the gyrus
    const crown = fbm3(q.x * 2.3, q.y * 2.3 + seed, q.z * 2.3) * 0.35;
    p.addScaledVector(en, amp * (sulcus * 1.2 + crown));
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  // Static geometry: a BVH keeps per-frame instrument raycasts cheap.
  computeBoundsTree.call(geo);
  const mesh = new THREE.Mesh(geo, Materials.brain());
  mesh.name = `${id}Lobe`;
  mesh.userData = { kind: 'brain', id };
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** Deep background: the dark floor of the basal cisterns / tentorial region. */
function buildFloor(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(110, 110, 110, 110);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + 5, y = pos.getY(i) - 3;
    pos.setXYZ(i, x, y, ANATOMY.brain.floorZ + fbm3(x * 0.12, y * 0.12, 3) * 3);
  }
  geo.computeVertexNormals();
  computeBoundsTree.call(geo);
  const mesh = new THREE.Mesh(geo, Materials.floor());
  mesh.name = 'floor';
  mesh.userData = { kind: 'floor' };
  mesh.receiveShadow = true;
  return mesh;
}

export interface BrainModel {
  group: THREE.Group;
  lobes: Record<LobeId, THREE.Group>;
  /** 0 = closed fissure, 1 = fully retracted. */
  setRetraction(lobe: LobeId, r: number): void;
}

export function buildBrain(): BrainModel {
  const b = ANATOMY.brain;
  const group = new THREE.Group();
  group.name = 'brain';
  // Each lobe sits in its own group so retraction can move it without rebuilding geometry.
  const frontal = new THREE.Group();
  frontal.add(buildLobe('frontal', b.frontal.center, b.frontal.radii, b.frontal.exponent));
  const temporal = new THREE.Group();
  temporal.add(buildLobe('temporal', b.temporal.center, b.temporal.radii, b.temporal.exponent));
  group.add(frontal, temporal, buildFloor());
  const lobes = { frontal, temporal };

  // Config positions are the opened state; lower retraction lets the lobe fall back toward the fissure.
  const setRetraction = (lobe: LobeId, r: number) => {
    const sign = lobe === 'frontal' ? -1 : 1;
    lobes[lobe].position.y = sign * (1 - r) * b.maxRetraction;
  };
  setRetraction('frontal', b.initialRetraction);
  setRetraction('temporal', b.initialRetraction);
  return { group, lobes, setRetraction };
}
