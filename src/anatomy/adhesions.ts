import * as THREE from 'three';
import type { AneurysmModel } from './aneurysm';
import { profileRadius } from './aneurysm';
import { ANATOMY, type VesselId } from './config';
import { Materials } from './materials';
import { fbm3 } from './noise';
import type { VesselModel } from './vessels';

export type AdhesionId = 'neckProximal' | 'neckDistal' | 'pcomVeil' | 'domeTether';

/**
 * Tissue that must be dissected before a clip can be applied safely:
 *  - neckProximal / neckDistal: the arachnoid cuff around the aneurysm neck.
 *    Both sides of the neck must be seen ("proximal and distal neck") so the
 *    clip blades can be passed fully across it.
 *  - pcomVeil: arachnoid over the PCom origin. The PCom must be positively
 *    identified so it is not included in the clip.
 *  - domeTether: a band from the dome to the oculomotor nerve. Pulling the
 *    dome while it is tethered can tear the thin wall.
 * Neck tissue is freed bluntly with the dissector; arachnoid bands can also
 * be cut with scissors ("sharp").
 */
export class Adhesion {
  progress = 0;
  freed = false;
  private fade = 1;
  private readonly rest: Float32Array;

  constructor(
    readonly id: AdhesionId,
    readonly mesh: THREE.Mesh,
    /** Can be cut with scissors in one snip. */
    readonly sharp: boolean,
    /** Center the leaves retract away from as dissection proceeds. */
    private readonly center: THREE.Vector3,
  ) {
    this.rest = (mesh.geometry.attributes.position.array as Float32Array).slice();
  }

  /** Adds dissection progress (0..1 scale). Returns true when this call frees it. */
  advance(amount: number): boolean {
    if (this.freed) return false;
    this.progress = Math.min(1, this.progress + amount);
    if (this.progress >= 1) {
      this.freed = true;
      return true;
    }
    return false;
  }

  update(dt: number): void {
    const mat = this.mesh.material as THREE.MeshPhysicalMaterial;
    if (this.freed) {
      this.fade = Math.max(0, this.fade - dt * 1.5);
      if (this.fade === 0) this.mesh.visible = false;
    }
    mat.opacity = ANATOMY.adhesions.opacity * (1 - this.progress * 0.75) * this.fade;
    // Tissue is teased away from the structure as it is dissected.
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    const push = this.progress * 0.9 + (1 - this.fade) * 0.8;
    for (let i = 0; i < pos.count; i++) {
      const x = this.rest[i * 3], y = this.rest[i * 3 + 1], z = this.rest[i * 3 + 2];
      const dx = x - this.center.x, dy = y - this.center.y, dz = z - this.center.z;
      const l = Math.hypot(dx, dy, dz) || 1;
      pos.setXYZ(i, x + (dx / l) * push, y + (dy / l) * push, z + (dz / l) * push);
    }
    pos.needsUpdate = true;
  }
}

function finish(positions: number[], colors: number[], idx: number[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  // Patchy, fibrous look: modulate alpha with noise so edges are ragged, not geometric.
  for (let i = 0; i < colors.length / 4; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    colors[i * 4 + 3] *= THREE.MathUtils.clamp(0.55 + 1.1 * fbm3(x * 1.3, y * 1.3, z * 1.3 + 5), 0.1, 1);
  }
  // Planar UVs are enough for the fibrous texture at this scale.
  const uvs: number[] = [];
  for (let i = 0; i < positions.length / 3; i++) uvs.push(positions[i * 3] * 0.25 + positions[i * 3 + 2] * 0.15, positions[i * 3 + 1] * 0.25);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function gridIndices(nu: number, nv: number, idx: number[]): void {
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const k = i * (nv + 1) + j;
      idx.push(k, k + nv + 1, k + 1, k + 1, k + nv + 1, k + nv + 2);
    }
  }
}

/** One half of the cuff around the neck, covering azimuths [a0, a1] (radians). */
function neckCuff(an: AneurysmModel, icaRadius: number, a0: number, a1: number): THREE.BufferGeometry {
  const p = an.profile;
  const s0 = icaRadius * 0.45, s1 = p.neckEndS + 1.1;
  const nu = 14, nv = 36;
  const positions: number[] = [], colors: number[] = [], idx: number[] = [];
  const radial = new THREE.Vector3(), pt = new THREE.Vector3();
  for (let i = 0; i <= nu; i++) {
    const s = s0 + (s1 - s0) * (i / nu);
    for (let j = 0; j <= nv; j++) {
      const a = a0 + (a1 - a0) * (j / nv);
      radial.copy(an.u).multiplyScalar(Math.cos(a)).addScaledVector(an.v, Math.sin(a));
      pt.copy(an.base).addScaledVector(an.axis, s);
      const r = profileRadius(p, s) + ANATOMY.adhesions.cuffOffset + 0.25 * Math.sin((i / nu) * Math.PI);
      pt.addScaledVector(radial, r + fbm3(pt.x * 1.4, pt.y * 1.4, pt.z * 1.4) * 0.15);
      positions.push(pt.x, pt.y, pt.z);
      const edge = Math.min(j / nv, 1 - j / nv) * 2;
      const alpha = THREE.MathUtils.smoothstep(edge, 0, 0.3) * THREE.MathUtils.smoothstep(i / nu, 0, 0.15)
        * (1 - THREE.MathUtils.smoothstep(i / nu, 0.75, 1));
      colors.push(1, 1, 1, alpha);
    }
  }
  gridIndices(nu, nv, idx);
  return finish(positions, colors, idx);
}

/** A sleeve around part of a vessel (t0..t1 along its centerline). */
function vesselSleeve(v: VesselModel, t0: number, t1: number, extra: number): THREE.BufferGeometry {
  const nu = 24, nv = 24;
  const positions: number[] = [], colors: number[] = [], idx: number[] = [];
  const frames = v.curve.computeFrenetFrames(nu, false);
  const pt = new THREE.Vector3();
  for (let i = 0; i <= nu; i++) {
    const t = t0 + (t1 - t0) * (i / nu);
    const c = v.curve.getPointAt(t);
    const r = v.radiusAt(t) + extra;
    for (let j = 0; j <= nv; j++) {
      const a = (j / nv) * Math.PI * 2;
      pt.copy(c).addScaledVector(frames.binormals[i], Math.cos(a) * r).addScaledVector(frames.normals[i], Math.sin(a) * r);
      pt.addScaledVector(frames.normals[i], fbm3(pt.x, pt.y, pt.z) * 0.2);
      positions.push(pt.x, pt.y, pt.z);
      const end = Math.min(i / nu, 1 - i / nu) * 2;
      colors.push(1, 1, 1, THREE.MathUtils.smoothstep(end, 0, 0.4));
    }
  }
  gridIndices(nu, nv, idx);
  return finish(positions, colors, idx);
}

/** A flat band between two points (twisted, narrow in the middle). */
function band(p0: THREE.Vector3, p1: THREE.Vector3, width: number): THREE.BufferGeometry {
  const nu = 16, nv = 8;
  const along = p1.clone().sub(p0);
  const across = along.clone().cross(new THREE.Vector3(0, 0, 1)).normalize();
  const positions: number[] = [], colors: number[] = [], idx: number[] = [];
  for (let i = 0; i <= nu; i++) {
    const t = i / nu;
    const w = width * (0.55 + 0.45 * Math.abs(2 * t - 1));
    for (let j = 0; j <= nv; j++) {
      const v = j / nv - 0.5;
      const pt = p0.clone().addScaledVector(along, t).addScaledVector(across, v * w);
      pt.z -= Math.sin(t * Math.PI) * 0.6;
      positions.push(pt.x, pt.y, pt.z);
      colors.push(1, 1, 1, THREE.MathUtils.smoothstep(0.5 - Math.abs(v), 0, 0.25));
    }
  }
  gridIndices(nu, nv, idx);
  return finish(positions, colors, idx);
}

export function buildAdhesions(
  an: AneurysmModel, vessels: Map<VesselId, VesselModel>, oculomotor: THREE.CatmullRomCurve3,
): { group: THREE.Group; adhesions: Map<AdhesionId, Adhesion> } {
  const group = new THREE.Group();
  group.name = 'adhesions';
  const adhesions = new Map<AdhesionId, Adhesion>();
  const icaR = ANATOMY.vessels.ICA.radius[0];

  // Azimuth (around the aneurysm axis) that faces the proximal ICA.
  const ica = vessels.get('ICA')!;
  const prox = ica.curve.getPointAt(0.15).sub(an.base);
  prox.addScaledVector(an.axis, -prox.dot(an.axis));
  const aProx = Math.atan2(prox.dot(an.v), prox.dot(an.u));
  const half = THREE.MathUtils.degToRad(105);
  const neckCenter = an.base.clone().addScaledVector(an.axis, an.profile.neckEndS);

  const add = (id: AdhesionId, geo: THREE.BufferGeometry, sharp: boolean, center: THREE.Vector3) => {
    const mesh = new THREE.Mesh(geo, Materials.adhesion(ANATOMY.adhesions.opacity, ANATOMY.adhesions.color));
    mesh.name = `adhesion-${id}`;
    mesh.renderOrder = 3;
    const a = new Adhesion(id, mesh, sharp, center);
    mesh.userData = { kind: 'adhesion', id, adhesion: a };
    group.add(mesh);
    adhesions.set(id, a);
  };

  add('neckProximal', neckCuff(an, icaR, aProx - half, aProx + half), false, neckCenter);
  add('neckDistal', neckCuff(an, icaR, aProx + Math.PI - half, aProx + Math.PI + half), false, neckCenter);

  const pcom = vessels.get('PCom')!;
  add('pcomVeil', vesselSleeve(pcom, 0.12, 0.6, 0.55), true, pcom.curve.getPointAt(0.35));

  // Dome → oculomotor nerve band, from the deep side of the dome.
  const deep = new THREE.Vector3(0, 0, -1).addScaledVector(an.axis, an.axis.z).normalize();
  const domeCenter = an.base.clone().addScaledVector(an.axis, an.profile.domeCenterS);
  const p0 = domeCenter.clone().addScaledVector(deep, an.profile.domeR * 0.9);
  let best = Infinity;
  const p1 = new THREE.Vector3();
  for (let t = 0; t <= 1; t += 0.01) {
    const q = oculomotor.getPointAt(t);
    const d = q.distanceTo(p0);
    if (d < best) { best = d; p1.copy(q); }
  }
  p1.z += ANATOMY.nerves.oculomotor.radius * 0.8;
  add('domeTether', band(p0, p1, 2.2), true, p0.clone().lerp(p1, 0.5));

  return { group, adhesions };
}
