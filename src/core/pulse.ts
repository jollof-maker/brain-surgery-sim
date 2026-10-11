/**
 * Arterial pressure waveform, normalized to 0..1, for a cardiac phase in [0, 1).
 * Shape: fast systolic upstroke, rounded peak, dicrotic notch (aortic valve
 * closure) at ~38% of the cycle, then a slow diastolic run-off.
 */
export function arterialPulse(phase: number): number {
  const p = phase - Math.floor(phase);
  const systole = Math.exp(-Math.pow((p - 0.14) / 0.075, 2));
  const dicrotic = 0.32 * Math.exp(-Math.pow((p - 0.42) / 0.06, 2));
  const runoff = 0.18 * Math.exp(-p * 2.2);
  return Math.min(1, systole + dicrotic + runoff);
}

/** Advances a cardiac phase accumulator by dt seconds at a heart rate in bpm. */
export function advancePhase(phase: number, dt: number, heartRate: number): number {
  return (phase + (dt * heartRate) / 60) % 1;
}

const g = (p: number, mu: number, sigma: number) => Math.exp(-(((p - mu) / sigma) ** 2));

/**
 * Synthetic lead-II ECG (mV-ish, baseline 0) for a cardiac phase in [0, 1).
 * The R wave sits at phase ≈0.93, ~0.2 cycle before the arterial pulse peak
 * (phase 0.14), matching the delay between electrical and mechanical systole
 * plus pulse transit.
 */
export function ecgWave(phase: number): number {
  const p = (phase + 0.25) % 1;
  return 0.12 * g(p, 0.08, 0.025) // P
    - 0.1 * g(p, 0.165, 0.008)    // Q
    + 1.0 * g(p, 0.18, 0.01)      // R
    - 0.22 * g(p, 0.198, 0.01)    // S
    + 0.26 * g(p, 0.42, 0.045);   // T
}
