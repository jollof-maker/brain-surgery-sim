import * as THREE from 'three';
import { ANATOMY, type Vec3 } from './config';
import { Materials } from './materials';
import { fbm3 } from './noise';

export type ArachnoidBand = 'sylvian' | 'carotid';

/**
 * Arachnoid membranes: the thin, cobweb-like layer that bridges the sylvian
 * fissure and wraps the vessels in the basal cisterns. Opening the fissure
 * means cutting these bands sharply (scissors) rather than tearing them, to
 * avoid pulling on bridging veins and small arteries.
 *
 * Each band is split into segments along its length; each segment is its own
 * mesh so it can be cut individually. When cut, the two leaves of the segment
 * recoil toward the lobes they are attached to.
 */
export class ArachnoidSegment {
  cut = false;
  /** 0 → 1 as the cut leaves recoil. */
  private recoil = 0;
  private readonly rest: Float32Array;

  constructor(
    readonly mesh: THREE.Mesh,
    readonly band: ArachnoidBand,
    readonly index: number,
    /** Cutting this segment injures a small bridging vessel. */
    readonly bridging: boolean,
    private readonly across: THREE.Vector3,
    private readonly width: number,
    /** Per-vertex position across the band, 0..1. */
    private readonly vCoord: Float32Array,
  ) {
    this.rest = (mesh.geometry.attributes.position.array as Float32Array).slice();
  }

  doCut(): void {
    this.cut = true;
  }

  update(dt: number): void {
    if (!this.cut || this.recoil >= 1) return;
    this.recoil = Math.min(1, this.recoil + dt * 1.6);
    const e = 1 - Math.pow(1 - this.recoil, 3);
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const v = this.vCoord[i];
      // Each leaf slides toward its own edge and crumples slightly upward.
      const side = v < 0.5 ? -1 : 1;
      const travel = (0.5 - Math.abs(v - 0.5)) * this.width * 0.85 * e;
      pos.setXYZ(
        i,
        this.rest[i * 3] + this.across.x * side * travel,
        this.rest[i * 3 + 1] + this.across.y * side * travel,
        this.rest[i * 3 + 2] + this.across.z * side * travel + e * 0.8 * Math.sin(v * 40),
      );
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
    (this.mesh.material as THREE.MeshPhysicalMaterial).opacity *= 1 - dt * 1.2;
    if (this.recoil >= 1) this.mesh.visible = false;
  }
}

function buildBand(band: ArachnoidBand, from: Vec3, to: Vec3, width: number, segments: number, opacity: number, sag: number): ArachnoidSegment[] {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const along = b.clone().sub(a);
  const across = new THREE.Vector3(0, 0, 1).cross(along).normalize();
  const bridging = ANATOMY.arachnoid.bridging[band] ?? [];
  const out: ArachnoidSegment[] = [];
  const nu = 10, nv = 28;
  for (let s = 0; s < segments; s++) {
    const positions: number[] = [], uvs: number[] = [], colors: number[] = [], idx: number[] = [];
    const vCoord = new Float32Array((nu + 1) * (nv + 1));
    for (let i = 0; i <= nu; i++) {
      const t = (s + i / nu) / segments;
      for (let j = 0; j <= nv; j++) {
        const v = j / nv;
        vCoord[i * (nv + 1) + j] = v;
        const p = a.clone().addScaledVector(along, t).addScaledVector(across, width * (v - 0.5));
        // Membrane sags into the fissure and is gently wrinkled.
        p.z += -sag * (1 - (2 * v - 1) ** 2) + fbm3(p.x * 0.25, p.y * 0.25, p.z * 0.25 + s) * 1.2;
        positions.push(p.x, p.y, p.z);
        uvs.push(t * along.length() / 20, v * width / 20);
        // Fade toward the band's edges, where it merges into the pia of each lobe
        // or thins out along the fissure — no hard rectangular borders.
        const edgeV = Math.min(v, 1 - v) * 2;
        const edgeT = Math.min(t, 1 - t) * 2;
        const alpha = THREE.MathUtils.smoothstep(edgeV, 0, 0.5) * THREE.MathUtils.smoothstep(edgeT, 0, 0.35)
          * THREE.MathUtils.clamp(0.7 + 0.6 * fbm3(p.x * 0.35, p.y * 0.35, 9), 0, 1);
        colors.push(1, 1, 1, alpha);
      }
    }
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const k = i * (nv + 1) + j;
        idx.push(k, k + nv + 1, k + 1, k + 1, k + nv + 1, k + nv + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, Materials.arachnoid(opacity));
    mesh.name = `arachnoid-${band}-${s}`;
    mesh.renderOrder = 2;
    const seg = new ArachnoidSegment(mesh, band, s, bridging.includes(s), across, width, vCoord);
    mesh.userData = { kind: 'arachnoid', id: `${band}-${s}`, segment: seg };
    out.push(seg);
  }
  return out;
}

export function buildArachnoid(): { group: THREE.Group; segments: ArachnoidSegment[] } {
  const group = new THREE.Group();
  group.name = 'arachnoid';
  const { sylvian, carotid } = ANATOMY.arachnoid;
  const segments = [
    ...buildBand('sylvian', sylvian.from, sylvian.to, sylvian.width, sylvian.segments, sylvian.opacity, 3),
    ...buildBand('carotid', carotid.from, carotid.to, carotid.width, carotid.segments, carotid.opacity, 1.5),
  ];
  segments.forEach((s) => group.add(s.mesh));
  return { group, segments };
}
