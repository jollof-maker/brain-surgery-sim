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
