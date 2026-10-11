/**
 * ============================================================================
 *  PHYSIOLOGY & BLEEDING CONFIG — teaching-model values, all in one place.
 * ============================================================================
 *
 * These are simplified, illustrative numbers chosen so that the simulator
 * behaves plausibly at "game speed". They are NOT clinical thresholds.
 *
 * Units: mL, mL/min, seconds, mmHg, bpm, % of baseline.
 */
export const PHYSIO = {
  /** Anesthetized adult at rest. */
  baseline: { hr: 68, sys: 118, dia: 66, spo2: 99 },

  /**
   * Hemorrhage response. Below `compensatedLoss` the body compensates almost
   * completely; beyond it heart rate rises and pressure falls (shown here as
   * linear per 1000 mL of further loss).
   */
  hemorrhage: { compensatedLoss: 200, hrPerLitre: 40, sysPerLitre: -45, diaPerLitre: -25 },

  /** Vitals approach their targets with this time constant (s) plus slow random drift. */
  smoothingSec: 6,
  drift: { hr: 1.2, bp: 1.8 },

  /**
   * Intraoperative rupture.
   *  rateMlMin — free bleeding from the dome with the parent artery open,
   *              scaled by mean arterial pressure / 85.
   *  surge     — sympathetic response (HR/BP spike) decaying with time constant `surgeSec`.
   */
  rupture: { rateMlMin: 240, surgeHr: 18, surgeSys: 22, surgeSec: 25 },

  /**
   * Hidden rupture risk: rises with handling of the dome. Handling near the
   * thin-walled BLEB counts `blebFactor`×, and dome handling before the neck
   * has been dissected counts `undissectedFactor`× (you are working blind).
   * Rupture becomes possible once risk > `threshold`.
   */
  risk: {
    perStress: 0.004, blebFactor: 3, blebRadius: 2.2, undissectedFactor: 1.4,
    threshold: 0.4, warnAt: 0.3, acuteSec: 1.2, acuteScale: 40,
  },

  /**
   * Temporary clipping of the supraclinoid ICA.
   *  safeSec          — tolerated occlusion at normal pressure (≈5 min is a common teaching figure);
   *                     shorter when mean arterial pressure is low.
   *  proximalInflow   — fraction of aneurysm inflow left with a proximal clip
   *                     (retrograde filling via the PCom/ophthalmic keeps some flow).
   *  trappedInflow    — with proximal AND distal clips ("trapping").
   *  minNeckDistance  — clips closer than this (mm) to the neck crowd out the permanent clip.
   */
  tempClip: {
    safeSec: 300, warnSec: 240, proximalInflow: 0.2, trappedInflow: 0.04, minNeckDistance: 3,
  },

  /**
   * Motor evoked potentials, % of baseline amplitude. After the tolerated
   * occlusion time MEP falls by `declinePerSec`; after release it recovers by
   * `recoverPerSec`. Occlusion beyond safeSec + `injuryAfterSec` leaves a lasting deficit.
   * A drop below `alarmBelow` % is the usual "significant change" warning.
   */
  mep: { declinePerSec: 0.7, floor: 8, recoverPerSec: 1.2, injuryAfterSec: 120, injuryPerSec: 0.25, alarmBelow: 50 },

  /** Monitor alarm limits. */
  alarms: { hrHigh: 110, hrLow: 45, sysLow: 85 },

  /** Suction removes pooled blood at up to this rate when the tip is in the pool. */
  suction: { poolRateMlS: 6, radius: 3 },

  /**
   * The blood pool fills the deep cavity as a flat layer. Its level rises by
   * 1000 / (π·radius²) mm per mL. It starts just under the cistern floor.
   */
  pool: { radius: 26, center: [4, -2] as [number, number], maxMl: 55 },

  /** Visible blood droplets (cosmetic). */
  particles: { max: 700, perSecond: 380, speed: [70, 150] as [number, number], gravity: 420, life: 1.1 },
};
