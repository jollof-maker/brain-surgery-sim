import * as THREE from 'three';
import type { ClipVariant } from '../core/SimState';
import { buildTube } from '../anatomy/tube';

/**
 * Procedural instrument models used as 3D cursors. Convention:
 * the working tip is at the origin, the shaft runs along +Y toward the
 * surgeon's hand, and jaws open in the local XY plane (which the tool
 * manager turns to face the microscope).
 */
export interface Instrument {
  root: THREE.Group;
  /** 0 = closed, 1 = open (scissors, bipolar, clip applier). */
  setOpen?(amount: number): void;
  /** Where an "active" glow appears (bipolar current), relative to the tip. */
  glowAt?: THREE.Vector3;
}

export const steel = new THREE.MeshPhysicalMaterial({ color: 0xe4e8ec, metalness: 0.45, roughness: 0.28, clearcoat: 0.4 });
const darkSteel = new THREE.MeshPhysicalMaterial({ color: 0xa4a9b0, metalness: 0.5, roughness: 0.35 });
const insulation = new THREE.MeshPhysicalMaterial({ color: 0x1d2c4a, roughness: 0.35, clearcoat: 0.6 });
const black = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.6 });

function cyl(r0: number, r1: number, y0: number, y1: number, mat: THREE.Material, seg = 20): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, y1 - y0, seg), mat);
  m.position.y = (y0 + y1) / 2;
  return m;
}

function suction(): Instrument {
  const root = new THREE.Group();
  root.add(cyl(0.95, 0.95, 0, 90, steel));
  // Dark lumen at the tip
  const lumen = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20), black);
  lumen.rotation.x = Math.PI / 2;
  lumen.position.y = -0.01;
  root.add(lumen);
  return { root };
}

function blade(length: number): THREE.Mesh {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.32, length * 0.25);
  s.lineTo(0.3, length);
  s.lineTo(-0.3, length);
  s.lineTo(-0.05, length * 0.2);
  s.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.22, bevelEnabled: false });
  g.translate(0, -length, -0.11);
  return new THREE.Mesh(g, steel);
}

function scissors(): Instrument {
  const root = new THREE.Group();
  const L = 6.5;
  const pivot = new THREE.Group();
  pivot.position.y = L;
  const b1 = blade(L), b2 = blade(L);
  b2.scale.x = -1;
  pivot.add(b1, b2);
  root.add(pivot, cyl(0.55, 0.65, L - 0.4, 90, steel));
  return {
    root,
    setOpen(a) {
      const ang = THREE.MathUtils.degToRad(14) * a;
      b1.rotation.z = ang / 2;
      b2.rotation.z = -ang / 2;
    },
  };
}

function bipolar(): Instrument {
  const root = new THREE.Group();
  const L = 24;
  const prongs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(side * 0.9, L, 0);
    const bare = cyl(0.14, 0.22, -L, -L + 5, steel, 12);
    const coated = cyl(0.25, 0.4, -L + 5, 0, insulation, 12);
    g.add(bare, coated);
    g.userData.side = side;
    prongs.push(g);
    root.add(g);
  }
  root.add(cyl(0.9, 1.1, L, 90, insulation));
  return {
    glowAt: new THREE.Vector3(0, 0.3, 0),
    root,
    setOpen(a) {
      // Prongs pivot at the handle end: tips touch when closed (a = 0), ~3 mm apart when open.
      for (const p of prongs) p.rotation.z = p.userData.side * THREE.MathUtils.degToRad(-1.8 + 3.2 * a);
    },
  };
}

function dissector(): Instrument {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), steel));
  const neck = cyl(0.3, 0.38, 0, 4, steel, 12);
  neck.rotation.x = 0.35;
  neck.position.z = 0.7;
  root.add(neck, cyl(0.5, 0.65, 3.6, 90, steel));
  return { root };
}

function spatulaPreview(): Instrument {
  const root = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-2, 14);
  s.lineTo(-2, 2);
  s.absarc(0, 2, 2, Math.PI, 0, false);
  s.lineTo(2, 14);
  s.lineTo(-2, 14);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false });
  root.add(new THREE.Mesh(g, steel), cyl(0.7, 0.7, 14, 90, darkSteel));
  return { root };
}

/**
 * Aneurysm clip (also used in M5 for applied clips).
 * Blades run from the tips (y = 0) to the spring (y = bladeLength).
 * Straight clips have parallel blades; curved clips bow sideways so they can
 * follow the parent artery wall.
 */
export function buildClip(variant: ClipVariant, temporary: boolean): { group: THREE.Group; blades: THREE.Object3D[]; bladeLength: number } {
  const group = new THREE.Group();
  const bladeLength = temporary ? 5 : 7;
  const mat = new THREE.MeshPhysicalMaterial({
    color: temporary ? 0xd8b04a : 0xb9b3d6, metalness: 0.85, roughness: 0.25, clearcoat: 0.5,
  });
  const blades: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const y = (i / 8) * bladeLength;
      const bow = variant === 'curved' ? 1.4 * Math.sin((y / bladeLength) * Math.PI * 0.5) * (1 - y / bladeLength) * 2 : 0;
      pts.push(new THREE.Vector3(bow, y, 0));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = buildTube(curve, (t) => 0.32 + 0.08 * t, { flatten: 0.55, capStart: true, capEnd: true, tubularSegments: 24, radialSegments: 12 });
    const m = new THREE.Mesh(geo, mat);
    const pivot = new THREE.Group();
    pivot.position.y = bladeLength;
    m.position.set(0, -bladeLength, side * 0.18);
    pivot.add(m);
    pivot.userData.side = side;
    blades.push(pivot);
    group.add(pivot);
  }
  // Spring coil
  for (let i = 0; i < 3; i++) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.16, 8, 24), mat);
    coil.position.set(0, bladeLength + 0.9, -0.3 + i * 0.3);
    group.add(coil);
  }
  return { group, blades, bladeLength };
}

function clipOnApplier(variant: ClipVariant, temporary: boolean): Instrument {
  const root = new THREE.Group();
  const clip = buildClip(variant, temporary);
  root.add(clip.group);
  const top = clip.bladeLength + 1.8;
  // Applier jaws grip the clip heels; then the bayonet shaft.
  for (const side of [-1, 1]) {
    const jaw = cyl(0.3, 0.45, top - 0.6, top + 8, darkSteel, 10);
    jaw.position.z = side * 0.8;
    root.add(jaw);
  }
  root.add(cyl(0.9, 1.1, top + 8, 95, steel));
  return {
    root,
    setOpen(a) {
      // Squeezing the applier opens the clip blades (they spring shut on release).
      const ang = THREE.MathUtils.degToRad(16) * a;
      for (const b of clip.blades) b.rotation.x = -b.userData.side * ang;
    },
  };
}

function doppler(): Instrument {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), darkSteel));
  root.add(cyl(0.5, 0.55, 0, 30, darkSteel), cyl(0.9, 1.0, 30, 90, new THREE.MeshPhysicalMaterial({ color: 0x2a6f8a, roughness: 0.4 })));
  return { root };
}

function endoscope(): Instrument {
  const root = new THREE.Group();
  root.add(cyl(1.35, 1.35, 0, 90, steel));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(1.2, 24), new THREE.MeshPhysicalMaterial({ color: 0x0a1018, roughness: 0.05, emissive: 0x2a3550, emissiveIntensity: 0.6 }));
  lens.rotation.x = Math.PI / 2;
  lens.position.y = -0.01;
  root.add(lens);
  return { root };
}

/** Factory for every tool's cursor model. */
export function buildInstrument(id: string, clipVariant: ClipVariant = 'straight'): Instrument {
  switch (id) {
    case 'suction': return suction();
    case 'scissors': return scissors();
    case 'bipolar': return bipolar();
    case 'dissector': return dissector();
    case 'spatula': return spatulaPreview();
    case 'clip': return clipOnApplier(clipVariant, false);
    case 'tempClip': return clipOnApplier('straight', true);
    case 'doppler': return doppler();
    case 'endoscope': return endoscope();
    default: return { root: new THREE.Group() }; // ICG: no instrument, just the crosshair
  }
}
