import * as THREE from 'three';
import type { Anatomy } from '../anatomy/Anatomy';
import type { SimState } from '../core/SimState';
import type { BleedingSystem } from './bleeding';
import type { Clipping } from './Clipping';
import type { Occlusion } from './occlusion';
import { PHYSIO } from './physiology';
import { RuptureModel } from './rupture';
import { VitalsModel, type AlarmId } from './vitals';

/**
 * The patient side of the simulation: vitals, the hidden rupture risk, and the
 * coupling between them and bleeding / temporary occlusion.
 */
export class Patient {
  readonly vitals = new VitalsModel();
  readonly rupture = new RuptureModel();
  /** Simulation time of the rupture (s since Begin), or null. */
  ruptureAt: number | null = null;
  /** Seconds since Begin. */
  elapsed = 0;
  alarms: AlarmId[] = [];
  private lastStressPoint: THREE.Vector3 | null = null;
  private readonly domeMat: THREE.MeshStandardMaterial;

  constructor(
    private readonly state: SimState,
    private readonly anatomy: Anatomy,
    readonly bleeding: BleedingSystem,
    private readonly occlusion: Occlusion,
    private readonly clipping: Clipping,
  ) {
    this.domeMat = anatomy.aneurysm.mesh.material as THREE.MeshStandardMaterial;
  }

  /** Handling of the aneurysm dome by an instrument (see RuptureModel.stress for units). */
  stressDome(amount: number, point?: THREE.Vector3): void {
    this.state.metrics.domeStress += amount;
    const onBleb = !!point && point.distanceTo(this.anatomy.aneurysm.blebPoint) < PHYSIO.risk.blebRadius;
    const a = this.anatomy.adhesions;
    const neckDissected = !!a.get('neckProximal')?.freed && !!a.get('neckDistal')?.freed;
    this.rupture.stress(amount, onBleb, neckDissected);
    if (point) this.lastStressPoint = point.clone();
  }

  get ruptured(): boolean {
    return this.ruptureAt !== null;
  }

  /** Forces a rupture now (debug / demo). */
  forceRupture(): void {
    if (this.ruptured) return;
    this.rupture.ruptured = true;
    this.onRupture();
  }

  update(dt: number): void {
    this.elapsed += dt;
    if (this.rupture.takeWarning()) this.state.toast('msg.domeThinning', 'danger');
    // Once the neck is securely clipped the sac is out of the circulation and cannot rupture.
    if (!this.clipping.occluded && this.rupture.update(dt)) this.onRupture();

    // The stressed dome flushes red — a visible warning to back off.
    this.domeMat.emissive.setRGB(0.5, 0.02, 0.02).multiplyScalar(this.rupture.acuteLevel * 0.35);

    this.vitals.update(dt, {
      ebl: this.bleeding.totalLoss,
      icaOccluded: this.occlusion.icaOccluded,
      sinceRupture: this.ruptureAt === null ? null : this.elapsed - this.ruptureAt,
      ischemia: this.clipping.ischemia(),
    });
    this.state.heartRate = this.vitals.hr;

    const alarms = this.vitals.alarms();
    if (alarms.join() !== this.alarms.join()) {
      const fresh = alarms.filter((a) => !this.alarms.includes(a));
      this.alarms = alarms;
      this.state.bus.emit('alarmsChanged', { alarms, fresh });
    }
  }

  bleedEnv(): { inflow: number; map: number } {
    return { inflow: this.clipping.flow.aneurysm, map: this.vitals.map };
  }

  private onRupture(): void {
    const an = this.anatomy.aneurysm;
    const domeCenter = an.base.clone().addScaledVector(an.axis, an.profile.domeCenterS);
    // The wall gives way where it was being handled — or at the bleb, its thinnest point.
    const p = this.lastStressPoint;
    const site = p && p.distanceTo(an.blebPoint) > PHYSIO.risk.blebRadius && p.distanceTo(domeCenter) < an.profile.domeR * 1.6
      ? p.clone() : an.blebPoint.clone();
    const normal = site.clone().sub(domeCenter).normalize();
    site.addScaledVector(normal, 0.1);
    this.ruptureAt = this.elapsed;
    this.bleeding.add('arterial', site, normal, PHYSIO.rupture.rateMlMin);
    this.state.bus.emit('ruptured', { time: this.elapsed });
    this.state.toast('msg.rupture', 'danger');
  }
}
