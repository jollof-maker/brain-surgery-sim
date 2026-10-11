import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { aneurysmProfile, profileRadius } from '../src/anatomy/aneurysm';
import { ANATOMY } from '../src/anatomy/config';
import { buildTube } from '../src/anatomy/tube';
import { arterialPulse } from '../src/core/pulse';

describe('aneurysm profile', () => {
  const p = aneurysmProfile();
  it('has the configured 6.6 mm maximum dome diameter', () => {
    let maxR = 0;
    for (let s = 0; s <= p.height; s += 0.01) maxR = Math.max(maxR, profileRadius(p, s));
    expect(maxR * 2).toBeCloseTo(ANATOMY.aneurysm.domeDiameter, 2);
  });
  it('is continuous where the neck meets the dome', () => {
    expect(profileRadius(p, p.neckEndS - 1e-6)).toBeCloseTo(profileRadius(p, p.neckEndS + 1e-6), 3);
    expect(profileRadius(p, p.neckEndS)).toBeCloseTo(ANATOMY.aneurysm.neckDiameter / 2, 3);
  });
  it('closes at the tip', () => {
    expect(profileRadius(p, p.height)).toBeCloseTo(0, 5);
  });
});

describe('tube geometry', () => {
  it('has outward-facing normals', () => {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(5, 1, 2), new THREE.Vector3(10, 0, 3)]);
    const geo = buildTube(curve, () => 1, { tubularSegments: 20, radialSegments: 12 });
    // Face normal from winding (not computeVertexNormals) must point away from the centerline.
    const pos = geo.attributes.position, idx = geo.index!;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const tri = new THREE.Triangle();
    const n = new THREE.Vector3(), mid = new THREE.Vector3(), onCurve = new THREE.Vector3();
    let outward = 0;
    const faces = idx.count / 3;
    for (let f = 0; f < faces; f++) {
      a.fromBufferAttribute(pos, idx.getX(f * 3));
      b.fromBufferAttribute(pos, idx.getX(f * 3 + 1));
      c.fromBufferAttribute(pos, idx.getX(f * 3 + 2));
      tri.set(a, b, c).getNormal(n);
      tri.getMidpoint(mid);
      // nearest curve point (coarse)
      let best = Infinity;
      for (let t = 0; t <= 1; t += 0.005) {
        const d = curve.getPointAt(t).distanceTo(mid);
        if (d < best) { best = d; onCurve.copy(curve.getPointAt(t)); }
      }
      if (n.dot(mid.sub(onCurve)) > 0) outward++;
    }
    expect(outward / faces).toBeGreaterThan(0.98);
  });
});

describe('arterial pulse', () => {
  it('stays within 0..1 and peaks in early systole', () => {
    let peak = 0, peakAt = 0;
    for (let p = 0; p < 1; p += 0.001) {
      const v = arterialPulse(p);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      if (v > peak) { peak = v; peakAt = p; }
    }
    expect(peakAt).toBeLessThan(0.25);
  });
});
