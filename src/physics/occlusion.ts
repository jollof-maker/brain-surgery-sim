import * as THREE from 'three';
import type { Anatomy } from '../anatomy/Anatomy';
import type { VesselModel } from '../anatomy/vessels';
import { buildClip } from '../tools/instruments';
import { PHYSIO } from './physiology';

export interface TempClip {
  id: string;
  /** Position along the ICA centerline (0 = proximal end, 1 = carotid bifurcation). */
  t: number;
  /** True if the clip sits proximal to the aneurysm (between the clinoid and the neck). */
  proximal: boolean;
  /** Simulation time when applied (s). */
  appliedAt: number;
  mesh: THREE.Group;
}

/**
 * Fraction of normal aneurysm inflow given the temporary clips on the ICA.
 * A proximal clip alone leaves retrograde filling (PCom / ophthalmic);
 * proximal + distal ("trapping") nearly stops it. A distal clip alone does
 * not help — the aneurysm still fills from the proximal ICA.
 */
export function aneurysmInflow(clips: Pick<TempClip, 'proximal'>[]): number {
  const prox = clips.some((c) => c.proximal);
  const dist = clips.some((c) => !c.proximal);
  if (prox && dist) return PHYSIO.tempClip.trappedInflow;
  if (prox) return PHYSIO.tempClip.proximalInflow;
  return 1;
}

/** Closest parameter t on a curve to a point (dense sampling; curves are short). */
export function closestT(curve: THREE.Curve<THREE.Vector3>, p: THREE.Vector3, samples = 240): number {
  let best = 0, bestD = Infinity;
  const v = new THREE.Vector3();
  for (let i = 0; i <= samples; i++) {
    const d = curve.getPointAt(i / samples, v).distanceToSquared(p);
    if (d < bestD) { bestD = d; best = i / samples; }
  }
  return best;
}

/**
 * Temporary clips placed on the supraclinoid ICA (M4). M5's flow model reads
 * the same list to darken ICG and quiet the Doppler distal to a clip.
 */
export class Occlusion {
  readonly group = new THREE.Group();
  readonly clips: TempClip[] = [];
  private readonly ica: VesselModel;
  /** ICA parameter where the aneurysm neck arises. */
  readonly neckT: number;
  private nextId = 1;

  constructor(private readonly anatomy: Anatomy) {
    this.group.name = 'temp-clips';
    this.ica = anatomy.vessels.get('ICA')!;
    this.neckT = closestT(this.ica.curve, anatomy.aneurysm.base);
  }

  get icaOccluded(): boolean {
    return this.clips.length > 0;
  }

  get proximalControl(): boolean {
    return this.clips.some((c) => c.proximal);
  }

  inflow(): number {
    return aneurysmInflow(this.clips);
  }

  /** Distance (mm) from a point on the ICA to the aneurysm neck. */
  neckDistance(t: number): number {
    return this.ica.curve.getPointAt(t).distanceTo(this.anatomy.aneurysm.base);
  }

  /**
   * Places a temporary clip across the ICA at parameter t, blades closing
   * across the vessel, heel toward the microscope (the approach direction).
   */
  apply(t: number, towardSurgeon: THREE.Vector3, time: number): TempClip {
    const curve = this.ica.curve;
    const center = curve.getPointAt(t);
    const xAxis = curve.getTangentAt(t).normalize();
    const yAxis = towardSurgeon.clone().addScaledVector(xAxis, -towardSurgeon.dot(xAxis)).normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis);
    const { group, blades } = buildClip('straight', true);
    // Blades nearly closed: the parent artery is flattened between them.
    for (const b of blades) b.rotation.x = -(b.userData.side as number) * 0.05;
    const r = this.ica.radiusAt(t);
    const root = new THREE.Group();
    root.add(group);
    root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
    // Blade tips just beyond the far wall; heel toward the surgeon.
    root.position.copy(center).addScaledVector(yAxis, -(r + 0.8));
    const id = `temp${this.nextId++}`;
    root.traverse((o) => {
      o.userData = { kind: 'tempClip', id };
      o.castShadow = true;
    });
    this.group.add(root);
    const clip: TempClip = { id, t, proximal: t < this.neckT, appliedAt: time, mesh: root };
    this.clips.push(clip);
    return clip;
  }

  /** Clip meshes, for picking. */
  pickables(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    this.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o); });
    return out;
  }

  remove(id: string): TempClip | null {
    const i = this.clips.findIndex((c) => c.id === id);
    if (i < 0) return null;
    const [clip] = this.clips.splice(i, 1);
    this.group.remove(clip.mesh);
    return clip;
  }
}
