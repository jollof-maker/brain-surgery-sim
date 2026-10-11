import * as THREE from 'three';

export interface TubeOptions {
  tubularSegments?: number;
  radialSegments?: number;
  /** Cross-section width:height ratio (<1 = flattened, e.g. optic nerve). */
  flatten?: number;
  /** Rounded caps at the start / end (skip a cap where the tube starts inside its parent vessel). */
  capStart?: boolean;
  capEnd?: boolean;
}

/**
 * Tube along a curve with a variable radius r(t), t in [0,1].
 * Like THREE.TubeGeometry, but tapered and optionally flattened.
 * UV: u runs along the tube (scaled by length so textures don't stretch), v around it.
 */
export function buildTube(
  curve: THREE.Curve<THREE.Vector3>, radius: (t: number) => number, opts: TubeOptions = {},
): THREE.BufferGeometry {
  const tubular = opts.tubularSegments ?? 96;
  const radial = opts.radialSegments ?? 24;
  const flatten = opts.flatten ?? 1;
  const length = curve.getLength();

  // Frames: parallel transport for round vessels; a world-Z-referenced frame
  // for flattened nerves so the flat side stays facing the microscope.
  const frenet = curve.computeFrenetFrames(tubular, false);
  const worldUp = new THREE.Vector3(0, 0, 1);

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), T = new THREE.Vector3();
  const v = new THREE.Vector3();

  const ring = (t: number, i: number, r: number, centerShift = 0) => {
    curve.getPointAt(t, P);
    curve.getTangentAt(t, T);
    if (flatten !== 1) {
      N.copy(worldUp).addScaledVector(T, -worldUp.dot(T)).normalize();
      B.crossVectors(T, N).normalize();
    } else {
      N.copy(frenet.normals[i]);
      B.copy(frenet.binormals[i]);
    }
    P.addScaledVector(T, centerShift);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      v.copy(P).addScaledVector(B, Math.cos(a) * r).addScaledVector(N, Math.sin(a) * r * flatten);
      positions.push(v.x, v.y, v.z);
      uvs.push((t * length) / 12, j / radial);
    }
  };

  // Optional start cap rings (hemispherical), then body, then end cap.
  const capRings = 6;
  let rows = 0;
  if (opts.capStart) {
    const r0 = radius(0);
    for (let k = capRings; k >= 1; k--) {
      const ang = (k / capRings) * (Math.PI / 2);
      ring(0, 0, Math.max(1e-3, Math.cos(ang) * r0), -Math.sin(ang) * r0);
      rows++;
    }
  }
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    ring(t, i, radius(t));
    rows++;
  }
  if (opts.capEnd) {
    const r1 = radius(1);
    for (let k = 1; k <= capRings; k++) {
      const ang = (k / capRings) * (Math.PI / 2);
      ring(1, tubular, Math.max(1e-3, Math.cos(ang) * r1), Math.sin(ang) * r1);
      rows++;
    }
  }

  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = (i + 1) * (radial + 1) + j;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
