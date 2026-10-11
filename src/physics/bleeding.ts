import * as THREE from 'three';
import { ANATOMY } from '../anatomy/config';
import { PHYSIO } from './physiology';

export type BleedType = 'ooze' | 'arterial';

/**
 * A bleeding point. "Ooze" is low-pressure bleeding from a small vessel
 * (stopped with bipolar coagulation). "Arterial" bleeding is an
 * intraoperative rupture: pulsatile, it cannot be coagulated, and only
 * proximal control (temporary clip) and a definitive clip stop it.
 */
export interface BleedSource {
  id: number;
  type: BleedType;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  /** mL/min while active (arterial: with the parent artery fully open, at normal pressure). */
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

/** Live conditions that scale arterial bleeding. */
export interface BleedEnv {
  /** Fraction of aneurysm inflow left by temporary clips (1 = open). */
  inflow: number;
  /** Mean arterial pressure (mmHg). */
  map: number;
}

/**
 * Soft random height field for the pool surface: under the coaxial light it
 * breaks the specular reflection into the glints of a liquid surface.
 */
function rippleTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null; // unit tests run without a DOM
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 6 + Math.random() * 26;
    const v = Math.random() < 0.5 ? 255 : 0;
    // Draw wrapped copies so the texture tiles seamlessly.
    for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) {
      const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      grad.addColorStop(0, `rgba(${v},${v},${v},0.16)`);
      grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = grad;
      g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  return t;
}

/** A bleeding point's blob stops growing at this volume; the rest runs off into the pool. */
const BLOB_MAX_ML = 0.03;

/** Cosmetic droplets for spurting arterial bleeding. */
class Droplets {
  readonly mesh: THREE.InstancedMesh;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly size: Float32Array;
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(max: number) {
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x7a0a0a, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'blood-droplets';
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max).fill(-1);
    this.size = new Float32Array(max);
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, this.m);
  }

  emit(origin: THREE.Vector3, dir: THREE.Vector3, speed: number, spread: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.life.length;
    const r = () => (Math.random() - 0.5) * 2 * spread;
    this.v.set(dir.x + r(), dir.y + r(), dir.z + r()).normalize().multiplyScalar(speed);
    this.pos.set([origin.x, origin.y, origin.z], i * 3);
    this.vel.set([this.v.x, this.v.y, this.v.z], i * 3);
    this.life[i] = PHYSIO.particles.life * (0.6 + Math.random() * 0.4);
    this.size[i] = 0.12 + Math.random() * 0.18;
  }

  /** Removes droplets near a point (suction tip). */
  clearNear(p: THREE.Vector3, radius: number): void {
    for (let i = 0; i < this.life.length; i++) {
      if (this.life[i] <= 0) continue;
      const dx = this.pos[i * 3] - p.x, dy = this.pos[i * 3 + 1] - p.y, dz = this.pos[i * 3 + 2] - p.z;
      if (dx * dx + dy * dy + dz * dz < radius * radius) this.life[i] = 0;
    }
  }

  update(dt: number, floorZ: number): void {
    const g = PHYSIO.particles.gravity;
    for (let i = 0; i < this.life.length; i++) {
      if (this.life[i] <= 0) {
        if (this.life[i] > -1) {
          this.life[i] = -1;
          this.m.makeScale(0, 0, 0);
          this.mesh.setMatrixAt(i, this.m);
        }
        continue;
      }
      this.life[i] -= dt;
      const o = i * 3;
      this.vel[o + 2] -= g * dt;
      // Viscous drag keeps droplets in a short arc.
      const drag = Math.exp(-dt * 2.5);
      this.vel[o] *= drag; this.vel[o + 1] *= drag;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      if (this.pos[o + 2] < floorZ) this.life[i] = 0; // fell into the pool
      const sp = Math.hypot(this.vel[o], this.vel[o + 1], this.vel[o + 2]);
      this.v.set(this.vel[o], this.vel[o + 1], this.vel[o + 2]).normalize();
      this.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.v);
      const k = this.size[i];
      this.s.set(k, k, k * (1 + Math.min(2, sp / 80)));
      this.m.compose(this.v.set(this.pos[o], this.pos[o + 1], this.pos[o + 2]), this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * Bleeding points, cosmetic droplets, and the blood pool. Blood that is not
 * aspirated collects as a flat layer in the deep cavity; its level rises with
 * volume and hides the structures below it until suction clears them.
 */
export class BleedingSystem {
  readonly group = new THREE.Group();
  readonly sources: BleedSource[] = [];
  /** Total blood lost (mL) — feeds the vitals model. */
  totalLoss = 0;
  /** Blood lying in the pool (mL). */
  poolVolume = 0;
  /** Total blood aspirated (mL). */
  aspirated = 0;
  /** Seconds since suction last removed blood (drives the "wet suction" sound). */
  lastAspirated = 1e9;
  private readonly pool: THREE.Mesh;
  private readonly droplets = new Droplets(PHYSIO.particles.max);
  private emitAcc = 0;
  private nextId = 1;
  private readonly blobGeo = new THREE.SphereGeometry(1, 24, 16);
  private readonly blobMat = new THREE.MeshPhysicalMaterial({
    color: 0x6a0b0b, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.4, sheenColor: new THREE.Color(0xff4040),
  });
  private readonly scarMat = new THREE.MeshStandardMaterial({ color: 0x2b1410, roughness: 0.9, transparent: true, opacity: 0.85 });
  private readonly ripple = rippleTexture();
  private readonly poolMat = new THREE.MeshPhysicalMaterial({
    color: 0x420404, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.3,
    sheen: 0.25, sheenColor: new THREE.Color(0xff4040), bumpMap: this.ripple, bumpScale: 0.8,
    emissive: new THREE.Color(0x060000), depthWrite: false,
  });
  private time = 0;

  constructor() {
    this.group.name = 'bleeding';
    const P = PHYSIO.pool;
    this.pool = new THREE.Mesh(new THREE.CircleGeometry(P.radius, 72), this.poolMat);
    this.pool.position.set(P.center[0], P.center[1], this.poolBaseZ);
    this.pool.userData = { kind: 'blood', id: 'pool' };
    this.pool.receiveShadow = true;
    this.pool.visible = false;
    this.group.add(this.pool, this.droplets.mesh);
  }

  /** Pool level when empty — just under the cistern floor. */
  private get poolBaseZ(): number {
    return ANATOMY.brain.floorZ - 1.5;
  }

  /** Height (z, mm) of the pool surface. */
  poolLevel(): number {
    return this.poolBaseZ + (this.poolVolume * 1000) / (Math.PI * PHYSIO.pool.radius ** 2);
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

  /** Nearest source within `radius` mm of a point (still bleeding, or with blood on it). */
  nearest(point: THREE.Vector3, radius: number): BleedSource | null {
    let best: BleedSource | null = null, bestD = radius;
    for (const s of this.sources) {
      if (!s.active && s.volume <= 0.001) continue;
      const d = s.position.distanceTo(point);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  arterial(): BleedSource | undefined {
    return this.sources.find((s) => s.type === 'arterial' && s.active);
  }

  /** Aspirate blood near the suction tip: blobs, droplets and the pool. Returns mL removed. */
  suction(point: THREE.Vector3, radius: number, dt: number): number {
    let removed = 0;
    for (const s of this.sources) {
      const d = s.position.distanceTo(point);
      if (d > radius) continue;
      const take = Math.min(s.volume, dt * 0.6 * (1 - d / radius + 0.3));
      s.volume -= take;
      removed += take;
    }
    this.droplets.clearNear(point, radius * 1.5);
    // The tip reaches the pool if it is at (or just above) the surface.
    const P = PHYSIO.pool;
    const inPool = point.z < this.poolLevel() + 1.5
      && Math.hypot(point.x - P.center[0], point.y - P.center[1]) < P.radius;
    if (inPool && this.poolVolume > 0) {
      const take = Math.min(this.poolVolume, PHYSIO.suction.poolRateMlS * dt);
      this.poolVolume -= take;
      removed += take;
    }
    if (removed > 1e-4) this.lastAspirated = 0;
    this.aspirated += removed;
    return removed;
  }

  coagulate(src: BleedSource): void {
    src.active = false;
    src.scar.visible = true;
  }

  /** Arterial bleeding stops (definitive clip, M5). */
  stop(src: BleedSource): void {
    src.active = false;
  }

  update(dt: number, pulse: number, env: BleedEnv = { inflow: 1, map: 85 }): void {
    this.lastAspirated += dt;
    this.time += dt;
    for (const s of this.sources) {
      if (s.active) {
        let rate = s.rate;
        if (s.type === 'arterial') {
          // Pulsatile: most blood leaves in systole.
          rate *= env.inflow * Math.max(0.2, env.map / 85) * (0.35 + 1.3 * pulse);
          this.emitArterial(s, dt, env.inflow, pulse);
        }
        const ml = (rate / 60) * dt;
        this.totalLoss += ml;
        const blob = Math.min(BLOB_MAX_ML - s.volume, ml);
        s.volume += Math.max(0, blob);
        this.poolVolume += ml - Math.max(0, blob); // overflow runs down into the pool
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
    this.poolVolume = Math.min(PHYSIO.pool.maxMl, this.poolVolume);

    // Pool surface: a thin film is translucent, a deep pool opaque; it ripples with the pulse.
    const level = this.poolLevel();
    this.pool.visible = this.poolVolume > 0.05;
    this.pool.position.z = level + (this.arterial() ? 0.05 * pulse : 0);
    this.poolMat.opacity = Math.min(0.93, 0.25 + this.poolVolume * 0.035);
    if (this.ripple) {
      // Surface slowly drifts; an active arterial bleed stirs it.
      const stir = this.arterial() ? 0.03 + 0.02 * pulse : 0.006;
      this.ripple.offset.x += dt * stir;
      this.ripple.offset.y = Math.sin(this.time * 0.4) * 0.05;
    }
    this.droplets.update(dt, level);
  }

  /**
   * The jet leaves the tear along the wall normal, bent toward the microscope:
   * the blood wells up out of the deep corridor into the surgeon's view.
   */
  private jetDir(normal: THREE.Vector3): THREE.Vector3 {
    const [x, y, z] = ANATOMY.microscope.viewDir;
    return normal.clone().multiplyScalar(0.6).add(new THREE.Vector3(x, y, z).normalize()).normalize();
  }

  private emitArterial(s: BleedSource, dt: number, inflow: number, pulse: number): void {
    const P = PHYSIO.particles;
    this.emitAcc += dt * P.perSecond * inflow * (0.1 + pulse * 1.6);
    const [lo, hi] = P.speed;
    // Jets lose height as inflow falls (temporary clip).
    const speedScale = 0.35 + 0.65 * Math.sqrt(inflow);
    while (this.emitAcc >= 1) {
      this.emitAcc -= 1;
      this.droplets.emit(s.position, this.jetDir(s.normal), (lo + Math.random() * (hi - lo)) * speedScale * (0.5 + pulse), 0.35);
    }
  }
}
