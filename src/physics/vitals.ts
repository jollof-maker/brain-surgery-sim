import { PHYSIO } from './physiology';

export interface VitalsInputs {
  /** Estimated blood loss so far (mL). */
  ebl: number;
  /** Any temporary clip currently on the ICA. */
  icaOccluded: boolean;
  /** Seconds since the rupture, or null if none. */
  sinceRupture: number | null;
  /** Extra ischemia 0..1 from perforator/branch occlusion (set by the flow model in M5). */
  ischemia?: number;
}

export type AlarmId = 'hrHigh' | 'hrLow' | 'bpLow' | 'mepDrop' | 'occlusionWarn' | 'occlusionLong';

/**
 * Very small physiological model for the monitor. Each value moves toward a
 * target set by blood loss, the rupture surge and ICA occlusion, with slow
 * random drift so the numbers look alive.
 */
export class VitalsModel {
  hr = PHYSIO.baseline.hr;
  sys = PHYSIO.baseline.sys;
  dia = PHYSIO.baseline.dia;
  spo2 = PHYSIO.baseline.spo2;
  /** MEP amplitude, % of baseline. */
  mep = 100;
  /** Current continuous ICA occlusion (s); 0 when no temporary clip. */
  occlusionSec = 0;
  totalOcclusionSec = 0;
  maxOcclusionSec = 0;
  minMep = 100;
  /** Lasting MEP loss from prolonged ischemia (%). */
  deficit = 0;
  private driftHr = 0;
  private driftBp = 0;

  constructor(private readonly rng: () => number = Math.random) {}

  get map(): number {
    return this.dia + (this.sys - this.dia) / 3;
  }

  /** Tolerated occlusion time at the current mean pressure. */
  safeOcclusionSec(): number {
    return PHYSIO.tempClip.safeSec * Math.min(1.3, Math.max(0.4, this.map / 75));
  }

  update(dt: number, inp: VitalsInputs): void {
    const B = PHYSIO.baseline, H = PHYSIO.hemorrhage, R = PHYSIO.rupture;
    // Hemorrhage (litres beyond the compensated amount) and the rupture surge.
    const l = Math.max(0, inp.ebl - H.compensatedLoss) / 1000;
    const surge = inp.sinceRupture === null ? 0 : Math.exp(-inp.sinceRupture / R.surgeSec);
    const hrT = Math.min(150, B.hr + H.hrPerLitre * l + R.surgeHr * surge);
    const sysT = Math.max(55, B.sys + H.sysPerLitre * l + R.surgeSys * surge);
    const diaT = Math.max(30, B.dia + H.diaPerLitre * l + R.surgeSys * 0.5 * surge);

    // Ornstein–Uhlenbeck drift: wanders slowly, pulled back toward zero.
    const k = Math.min(1, dt / 20);
    this.driftHr += (this.rng() - 0.5) * PHYSIO.drift.hr * Math.sqrt(dt) * 2 - this.driftHr * k;
    this.driftBp += (this.rng() - 0.5) * PHYSIO.drift.bp * Math.sqrt(dt) * 2 - this.driftBp * k;

    const a = 1 - Math.exp(-dt / PHYSIO.smoothingSec);
    this.hr += (hrT + this.driftHr - this.hr) * a;
    this.sys += (sysT + this.driftBp - this.sys) * a;
    this.dia += (diaT + this.driftBp * 0.6 - this.dia) * a;
    const map = this.map;
    const spo2T = B.spo2 - (map < 55 ? (55 - map) * 0.3 : 0);
    this.spo2 += (spo2T - this.spo2) * a;

    // Temporary occlusion timing.
    if (inp.icaOccluded) {
      this.occlusionSec += dt;
      this.totalOcclusionSec += dt;
      this.maxOcclusionSec = Math.max(this.maxOcclusionSec, this.occlusionSec);
    } else {
      this.occlusionSec = 0;
    }

    // MEP: falls after the tolerated occlusion time (or with branch ischemia), recovers on release.
    const M = PHYSIO.mep;
    const over = inp.icaOccluded ? this.occlusionSec - this.safeOcclusionSec() : -1;
    const ischemia = inp.ischemia ?? 0;
    if (over > M.injuryAfterSec) this.deficit = Math.min(60, this.deficit + M.injuryPerSec * dt);
    if (over > 0 || ischemia > 0) {
      const rate = M.declinePerSec * (over > 0 ? 1 : 0) + M.declinePerSec * 2 * ischemia;
      this.mep = Math.max(M.floor, this.mep - rate * dt);
    } else {
      this.mep = Math.min(100 - this.deficit, this.mep + M.recoverPerSec * dt);
    }
    this.minMep = Math.min(this.minMep, this.mep);
  }

  alarms(): AlarmId[] {
    const A = PHYSIO.alarms, out: AlarmId[] = [];
    if (this.hr > A.hrHigh) out.push('hrHigh');
    if (this.hr < A.hrLow) out.push('hrLow');
    if (this.sys < A.sysLow) out.push('bpLow');
    if (this.mep < PHYSIO.mep.alarmBelow) out.push('mepDrop');
    if (this.occlusionSec > this.safeOcclusionSec()) out.push('occlusionLong');
    else if (this.occlusionSec > PHYSIO.tempClip.warnSec * (this.safeOcclusionSec() / PHYSIO.tempClip.safeSec)) out.push('occlusionWarn');
    return out;
  }
}
