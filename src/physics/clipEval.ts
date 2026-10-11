import * as THREE from 'three';
import { aneurysmProfile, profileRadius, type AneurysmProfile } from '../anatomy/aneurysm';
import { ANATOMY, type VesselId } from '../anatomy/config';
import type { ClipVariant } from '../core/SimState';

/**
 * ============================================================================
 *  GEOMETRIC CLIP EVALUATION
 * ============================================================================
 *
 * A clip is modeled in its own frame:
 *   Y — along the blades, from the TIP (y = 0) to the heel (y = L); this is the
 *       direction the applier comes from, so "depth" pushes the tip deeper.
 *   Z — the closing direction (the blades squeeze along Z).
 *   X — the remaining axis. A tube is closed cleanly when its axis runs along X
 *       (it passes *between* the blades).
 * A curved clip bows its blades toward +X.
 *
 * What we measure, all from the same config the 3D anatomy is built from:
 *   neckClosure   0..1  — share of the neck cross-section caught between the
 *                         working part of the blades. Short or misplaced blades
 *                         leave a residual lumen.
 *   residualNeck  mm    — how far above the parent wall the blades sit
 *                         (a "dog-ear" remnant can regrow).
 *   icaNarrowing  0..1  — share of the ICA cross-section pinched when the
 *                         blades ride into the parent wall.
 *   branches      0..1  — PCom / AChA (and others) caught or kinked by the blades.
 *   nerveContact        — blades on the oculomotor nerve.
 */

export const CLIP_LENGTH: Record<ClipVariant, number> = { straight: 7, curved: 7 };
/** The last bit at the tip and heel closes poorly. */
const TIP_DEAD = 0.3, HEEL_DEAD = 0.5;
/** Blade half-thickness (mm). */
const BLADE = 0.25;

export interface ClipFrame {
  tip: THREE.Vector3;
  x: THREE.Vector3;
  y: THREE.Vector3;
  z: THREE.Vector3;
}

export interface ClipEffects {
  neckClosure: number;
  residualNeck: number;
  icaNarrowing: number;
  branches: Partial<Record<VesselId, number>>;
  nerveContact: boolean;
  /** Blades placed on the dome rather than across the neck. */
  domeClip: boolean;
  /** Neck not dissected free: blades could not pass cleanly around it. */
  undissected: boolean;
  /** Clip plane nearly parallel to the neck axis. */
  misaligned: boolean;
}

export const NO_CLIP: ClipEffects = {
  neckClosure: 0, residualNeck: 0, icaNarrowing: 0, branches: {}, nerveContact: false,
  domeClip: false, undissected: false, misaligned: false,
};

interface Polyline {
  pts: THREE.Vector3[];
  radius: number[];
}

/** Everything the evaluation needs, built from config (pure — no meshes, usable in unit tests). */
export interface ClipTargets {
  base: THREE.Vector3;
  axis: THREE.Vector3;
  profile: AneurysmProfile;
  /** Axial distance from the base where the neck leaves the ICA wall. */
  sWall: number;
  icaRadiusAtNeck: number;
  vessels: Map<VesselId, Polyline>;
  cn3: Polyline;
}

function centerline(points: [number, number, number][], r0: number, r1: number, n = 120): Polyline {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const pts: THREE.Vector3[] = [], radius: number[] = [];
  for (let i = 0; i <= n; i++) {
    pts.push(curve.getPointAt(i / n));
    radius.push(r0 + (r1 - r0) * (i / n));
  }
  return { pts, radius };
}

/** Distance from a point to a polyline's centerline, and the tube radius there. */
function nearest(line: Polyline, p: THREE.Vector3): { d: number; r: number } {
  let best = Infinity, r = 0;
  for (let i = 0; i < line.pts.length; i++) {
    const d = line.pts[i].distanceToSquared(p);
    if (d < best) { best = d; r = line.radius[i]; }
  }
  return { d: Math.sqrt(best), r };
}

export function buildClipTargets(): ClipTargets {
  const icaR = ANATOMY.vessels.ICA.radius[0];
  const profile = aneurysmProfile(ANATOMY.aneurysm, icaR);
  const axis = new THREE.Vector3(...ANATOMY.aneurysm.direction).normalize();
  const base = new THREE.Vector3(...ANATOMY.aneurysm.origin);
  const vessels = new Map<VesselId, Polyline>();
  for (const def of Object.values(ANATOMY.vessels)) vessels.set(def.id, centerline(def.points, def.radius[0], def.radius[1]));
  const ica = vessels.get('ICA')!;
  let sWall = 0;
  for (let s = 0; s < 6; s += 0.02) {
    const n = nearest(ica, base.clone().addScaledVector(axis, s));
    if (n.d >= n.r) { sWall = s; break; }
  }
  const cn3 = ANATOMY.nerves.oculomotor;
  return {
    base, axis, profile, sWall, icaRadiusAtNeck: nearest(ica, base).r, vessels,
    cn3: centerline(cn3.points, cn3.radius, cn3.radius),
  };
}

/** Blade bow (toward +X) at distance y from the tip. */
export function bladeBow(variant: ClipVariant, y: number, L = CLIP_LENGTH[variant]): number {
  return variant === 'curved' ? 1.4 * Math.sin((y / L) * Math.PI * 0.5) * (1 - y / L) * 2 : 0;
}

/** Points along the closed blades' contact line, in world space. */
export function bladeSamples(frame: ClipFrame, variant: ClipVariant, n = 36): THREE.Vector3[] {
  const L = CLIP_LENGTH[variant];
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const y = (i / n) * L;
    out.push(frame.tip.clone().addScaledVector(frame.y, y).addScaledVector(frame.x, bladeBow(variant, y, L)));
  }
  return out;
}

/** Fraction of a disk of radius r lying within height h of one edge (circular segment). */
export function segmentFraction(h: number, r: number): number {
  const c = Math.min(2 * r, Math.max(0, h));
  const d = r - c; // signed distance of the chord from the center
  const area = r * r * Math.acos(THREE.MathUtils.clamp(d / r, -1, 1)) - d * Math.sqrt(Math.max(0, r * r - d * d));
  return area / (Math.PI * r * r);
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export function evaluateClip(frame: ClipFrame, variant: ClipVariant, T: ClipTargets, neckDissected = true): ClipEffects {
  const L = CLIP_LENGTH[variant];
  const { base, axis: A, profile } = T;
  const cosA = frame.x.dot(A);
  const fx: ClipEffects = { ...NO_CLIP, branches: {} };

  // --- Neck: where the aneurysm axis crosses the clip plane -------------------
  if (Math.abs(cosA) < 0.2) {
    fx.misaligned = true;
  } else {
    const sPlane = frame.tip.clone().sub(base).dot(frame.x) / cosA;
    const c = base.clone().addScaledVector(A, sPlane).sub(frame.tip);
    const cy = c.dot(frame.y), cz = c.dot(frame.z);
    // A curved blade sits a little higher/lower on the neck where it crosses it.
    const s = sPlane + bladeBow(variant, THREE.MathUtils.clamp(cy, 0, L), L) * cosA;
    const R = s > 0 && s < profile.height ? profileRadius(profile, Math.max(s, profile.neckEndS * 0.999)) : 0;
    if (R > 0) {
      // Half-extent of the (obliquely cut) cross-section along the blades and across them.
      const hY = R / Math.sqrt(Math.max(0.05, 1 - frame.y.dot(A) ** 2));
      const hZ = R / Math.sqrt(Math.max(0.05, 1 - frame.z.dot(A) ** 2));
      const coverage = overlap(cy - hY, cy + hY, TIP_DEAD, L - HEEL_DEAD) / (2 * hY);
      const straddle = Math.abs(cz) < hZ ? 1 : THREE.MathUtils.clamp(1 - (Math.abs(cz) - hZ) / 0.5, 0, 1);
      fx.neckClosure = coverage * straddle * (neckDissected ? 1 : 0.75);
      fx.undissected = !neckDissected;
    }
    fx.residualNeck = s - T.sWall;
    fx.domeClip = s > profile.neckEndS + 0.8;
    // Blades below the wall line bite into the parent artery.
    if (fx.neckClosure > 0 && s < T.sWall) {
      fx.icaNarrowing = segmentFraction(T.sWall - s, T.icaRadiusAtNeck);
    }
  }

  // --- Branches and nerve along the blades -------------------------------------
  const blades = bladeSamples(frame, variant);
  const inside = (p: THREE.Vector3) => {
    const n = nearest(T.vessels.get('ICA')!, p);
    if (n.d < n.r) return true;
    const s = p.clone().sub(base).dot(A);
    const rad = p.clone().sub(base).addScaledVector(A, -s).length();
    return s > 0 && s < profile.height && rad < profileRadius(profile, s);
  };
  for (const [id, line] of T.vessels) {
    if (id === 'ICA') continue;
    let occl = 0;
    for (const b of blades) {
      const n = nearest(line, b);
      // Ignore the part of a branch that is still inside the parent / aneurysm lumen.
      if (n.d > n.r + 0.8) continue;
      const i = line.pts.findIndex((q) => q.distanceTo(b) <= n.d + 1e-6);
      if (i >= 0 && inside(line.pts[i])) continue;
      if (n.d < n.r + BLADE) occl = Math.max(occl, 1);          // caught between the blades
      else occl = Math.max(occl, 0.3);                          // kinked by a blade
    }
    if (occl > 0) fx.branches[id] = occl;
  }
  fx.nerveContact = blades.some((b) => {
    const n = nearest(T.cn3, b);
    return n.d < n.r + BLADE + 0.15;
  });
  return fx;
}

/** Several clips together (tandem / additional clips). */
export function combineEffects(list: ClipEffects[]): ClipEffects {
  if (!list.length) return { ...NO_CLIP, branches: {} };
  const out: ClipEffects = { ...NO_CLIP, branches: {} };
  let open = 1;
  for (const e of list) {
    open *= 1 - e.neckClosure;
    out.icaNarrowing = Math.max(out.icaNarrowing, e.icaNarrowing);
    for (const [id, v] of Object.entries(e.branches)) {
      out.branches[id as VesselId] = Math.max(out.branches[id as VesselId] ?? 0, v);
    }
    out.nerveContact ||= e.nerveContact;
    out.domeClip ||= e.domeClip;
    out.undissected ||= e.undissected;
    out.misaligned ||= e.misaligned;
  }
  out.neckClosure = 1 - open;
  // The clip sitting closest to the parent wall defines the remnant.
  const closing = list.filter((e) => e.neckClosure > 0.5);
  out.residualNeck = closing.length ? Math.min(...closing.map((e) => e.residualNeck)) : 0;
  return out;
}

/** Thresholds used for the procedure flags and the debrief. */
export const CLIP_OK = {
  /** Neck closure needed to call the aneurysm occluded. */
  closure: 0.95,
  /** Largest acceptable neck remnant (mm). */
  residual: 1.5,
  /** Largest acceptable parent narrowing. */
  narrowing: 0.25,
};
