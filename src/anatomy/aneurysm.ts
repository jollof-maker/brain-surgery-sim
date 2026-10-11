import * as THREE from 'three';
import { ANATOMY } from './config';
import { Materials } from './materials';
import { fbm3 } from './noise';

/**
 * The aneurysm is built as a surface of revolution in its own local frame:
 *   axis  = projection direction (from the ICA wall toward the dome tip)
 *   s     = distance along the axis from the neck base
 * Profile: a short NECK (radius = neckDiameter/2) that flares into the parent
 * wall, then an ellipsoidal DOME (max diameter = domeDiameter).
 * A daughter sac (BLEB) is added as a local outward bulge on the dome — the
 * bleb has the thinnest wall and is the most likely rupture point.
 */
export interface AneurysmModel {
  mesh: THREE.Mesh;
  /** Neck base center (on the ICA centerline). */
  base: THREE.Vector3;
  axis: THREE.Vector3;
  /** Perpendicular basis for azimuth around the axis. */
  u: THREE.Vector3;
  v: THREE.Vector3;
  profile: AneurysmProfile;
  /** World position of the bleb apex. */
  blebPoint: THREE.Vector3;
}

export interface AneurysmProfile {
  neckR: number;
  domeR: number;
  /** Dome semi-axis along the projection axis. */
  domeA: number;
  /** Axial distance from the base to the dome center. */
  domeCenterS: number;
  /** Axial distance where the neck ends and the dome begins. */
  neckEndS: number;
  /** Axial distance from the base to the dome tip. */
  height: number;
}

/** Pure profile math (unit-tested): where the dome sits relative to the neck. */
export function aneurysmProfile(cfg: typeof ANATOMY.aneurysm = ANATOMY.aneurysm, embed = 0): AneurysmProfile {
  const neckR = cfg.neckDiameter / 2;
  const domeR = cfg.domeDiameter / 2;
  const domeA = domeR * cfg.domeElongation;
  // The neck joins the dome where the ellipsoid radius equals the neck radius.
  const k = Math.sqrt(1 - (neckR / domeR) ** 2);
  // `embed` = length of neck hidden inside the parent artery (base starts on the ICA centerline).
  const neckEndS = embed + cfg.neckLength;
  const domeCenterS = neckEndS + domeA * k;
  return { neckR, domeR, domeA, domeCenterS, neckEndS, height: domeCenterS + domeA };
}

/** Radius of the surface of revolution at axial distance s (before bleb/irregularity). */
export function profileRadius(p: AneurysmProfile, s: number, flare = 0): number {
  if (s <= p.neckEndS) {
    // Flared neck: wider where it merges into the ICA wall.
    const f = 1 - s / Math.max(p.neckEndS, 1e-3);
    return p.neckR * (1 + flare * f * f);
  }
  const x = (s - p.domeCenterS) / p.domeA;
  return p.domeR * Math.sqrt(Math.max(0, 1 - x * x));
}

export function buildAneurysm(icaRadius: number): AneurysmModel {
  const cfg = ANATOMY.aneurysm;
  // The neck is rooted on the ICA centerline so it emerges cleanly from the parent wall.
  const prof = aneurysmProfile(cfg, icaRadius);
  const axis = new THREE.Vector3(...cfg.direction).normalize();
  const base = new THREE.Vector3(...cfg.origin);
  const u = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 0, 1)).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u).normalize();

  const pol = THREE.MathUtils.degToRad(cfg.bleb.polarDeg);
  const az = THREE.MathUtils.degToRad(cfg.bleb.azimuthDeg);
  const blebDir = new THREE.Vector3()
    .addScaledVector(axis, Math.cos(pol))
    .addScaledVector(u, Math.sin(pol) * Math.cos(az))
    .addScaledVector(v, Math.sin(pol) * Math.sin(az))
    .normalize();

  const rings = 80, seg = 56;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const neckCol = new THREE.Color(ANATOMY.colors.artery);
  const wallCol = new THREE.Color(ANATOMY.colors.aneurysmWall);
  const blebCol = new THREE.Color(ANATOMY.colors.bleb);
  const domeCenter = base.clone().addScaledVector(axis, prof.domeCenterS);
  const p = new THREE.Vector3(), radial = new THREE.Vector3(), dir = new THREE.Vector3();
  const c = new THREE.Color();
  let blebPoint = domeCenter.clone().addScaledVector(blebDir, prof.domeR);
  let blebBest = -Infinity;
  const blebSigma = cfg.bleb.radius / prof.domeR;

  for (let i = 0; i <= rings; i++) {
    // Neck: linear in s. Dome: s = C - a·cos(θ), θ from the neck junction to π (tip),
    // so the rounded tip gets as many rings as the sides.
    const ti = i / rings;
    const theta0 = Math.acos((prof.domeCenterS - prof.neckEndS) / prof.domeA);
    const s = ti < 0.2
      ? (ti / 0.2) * prof.neckEndS
      : prof.domeCenterS - prof.domeA * Math.cos(theta0 + ((ti - 0.2) / 0.8) * (Math.PI - theta0));
    const r = profileRadius(prof, s, 0) * (s < icaRadius * 0.5 ? 0.85 : 1);
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      radial.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
      p.copy(base).addScaledVector(axis, s).addScaledVector(radial, r);

      // Irregular wall + bleb bulge (dome only).
      dir.copy(p).sub(domeCenter);
      const dLen = dir.length();
      if (dLen > 1e-4) dir.divideScalar(dLen);
      const domeWeight = THREE.MathUtils.smoothstep(s, prof.neckEndS, prof.domeCenterS);
      const lump = fbm3(p.x * 0.9, p.y * 0.9, p.z * 0.9) * 0.25 * domeWeight;
      const ang = Math.acos(THREE.MathUtils.clamp(dir.dot(blebDir), -1, 1));
      const bleb = cfg.bleb.radius * 1.25 * Math.exp(-((ang / blebSigma) ** 2)) * domeWeight;
      if (dLen > 1e-4) p.addScaledVector(dir, lump + bleb);
      if (bleb > blebBest) { blebBest = bleb; blebPoint = p.clone(); }

      positions.push(p.x, p.y, p.z);
      uvs.push(s / 3, j / seg);
      // Color: artery-like neck → paler, thin dome → red, very thin bleb.
      const neckT = 1 - THREE.MathUtils.smoothstep(s, 0, prof.domeCenterS);
      c.copy(wallCol).lerp(neckCol, neckT).lerp(blebCol, Math.min(1, bleb / (cfg.bleb.radius * 0.7)));
      colors.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = (i + 1) * (seg + 1) + j;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = Materials.aneurysm(cfg.pulse);
  mat.color.set(0xffffff); // color comes from vertex colors
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'aneurysm';
  mesh.userData = { kind: 'aneurysm' };
  mesh.castShadow = mesh.receiveShadow = true;

  return { mesh, base, axis, u, v, profile: prof, blebPoint };
}
