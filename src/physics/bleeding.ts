import * as THREE from 'three';

export type BleedType = 'ooze' | 'arterial';

/**
 * A bleeding point. "Ooze" is low-pressure bleeding from a small vessel
 * (stopped with bipolar coagulation). "Arterial" bleeding (intraoperative
 * rupture) arrives in M4 together with blood particles and pooling.
 */
export interface BleedSource {
  id: number;
  type: BleedType;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  /** mL/min while active. */
  rate: number;
  active: boolean;
  /** Blood currently sitting on the bleeding point (mL). */
  volume: number;
  /** Seconds of continuous bipolar contact so far. */
  coag: number;
  mesh: THREE.Mesh;
  /** Charred spot left after coagulation. */
  scar: THREE.Mesh;
}

/** A bleeding point's blob stops growing at this volume; the rest runs off (pooling arrives in M4). */
const BLOB_MAX_ML = 0.03;

export class BleedingSystem {
  readonly group = new THREE.Group();
  readonly sources: BleedSource[] = [];
  /** Total blood lost (mL) — feeds the vitals model in M4. */
  totalLoss = 0;
  private nextId = 1;
  private readonly blobGeo = new THREE.SphereGeometry(1, 24, 16);
  private readonly blobMat = new THREE.MeshPhysicalMaterial({
    color: 0x6a0b0b, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.4, sheenColor: new THREE.Color(0xff4040),
  });
  private readonly scarMat = new THREE.MeshStandardMaterial({ color: 0x2b1410, roughness: 0.9, transparent: true, opacity: 0.85 });

  constructor() {
    this.group.name = 'bleeding';
  }

  add(type: BleedType, position: THREE.Vector3, normal: THREE.Vector3, rate: number): BleedSource {
    const mesh = new THREE.Mesh(this.blobGeo, this.blobMat);
    mesh.position.copy(position);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    mesh.scale.setScalar(0.01);
    mesh.userData = { kind: 'blood' };
    const scar = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20), this.scarMat);
    scar.position.copy(position).addScaledVector(normal, 0.03);
    scar.quaternion.copy(mesh.quaternion);
    scar.visible = false;
    this.group.add(mesh, scar);
    const src: BleedSource = {
      id: this.nextId++, type, position: position.clone(), normal: normal.clone(), rate,
      active: true, volume: 0.02, coag: 0, mesh, scar,
    };
    this.sources.push(src);
    return src;
  }

  /** Nearest active source within `radius` mm of a point. */
  nearest(point: THREE.Vector3, radius: number): BleedSource | null {
    let best: BleedSource | null = null, bestD = radius;
    for (const s of this.sources) {
      if (!s.active && s.volume <= 0.001) continue;
      const d = s.position.distanceTo(point);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  /** Aspirate blood near the suction tip. Returns mL removed. */
  suction(point: THREE.Vector3, radius: number, dt: number): number {
    let removed = 0;
    for (const s of this.sources) {
      const d = s.position.distanceTo(point);
      if (d > radius) continue;
      const take = Math.min(s.volume, dt * 0.6 * (1 - d / radius + 0.3));
      s.volume -= take;
      removed += take;
    }
    return removed;
  }

  coagulate(src: BleedSource): void {
    src.active = false;
    src.scar.visible = true;
  }

  update(dt: number, pulse: number): void {
    for (const s of this.sources) {
      if (s.active) {
        const ml = (s.rate / 60) * dt;
        this.totalLoss += ml;
        s.volume = Math.min(BLOB_MAX_ML, s.volume + ml);
      } else {
        // Without a source, the remaining clot slowly flattens out.
        s.volume = Math.max(0, s.volume - dt * 0.02);
      }
      // Blob radius from volume (mL = cm³ → mm³ ×1000), squashed onto the surface; wells with the pulse.
      const r = Math.cbrt((s.volume * 1000 * 3) / (4 * Math.PI)) * 0.9;
      const well = s.active ? 1 + 0.08 * pulse : 1;
      s.mesh.scale.set(r * well, r * well, r * 0.35);
      s.mesh.visible = r > 0.05;
    }
  }
}
