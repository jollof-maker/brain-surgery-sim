import { PHYSIO } from './physiology';

/**
 * Hidden intraoperative-rupture model.
 *
 * `risk` (0..1) is cumulative wall damage from handling the dome; it never
 * goes down. `acute` is the stress of the last second or so. Rupture is a
 * random event whose rate grows with the square of the risk above threshold,
 * and is much higher while the dome is actively being manipulated — so most
 * ruptures happen *during* rough handling, as in reality.
 */
export class RuptureModel {
  risk = 0;
  acute = 0;
  ruptured = false;
  private warned = false;

  constructor(private readonly rng: () => number = Math.random) {}

  /**
   * Handling of the dome. `amount` is in tool-specific stress units
   * (≈1 per second of gentle contact, tens per second of rough scrubbing).
   */
  stress(amount: number, onBleb: boolean, neckDissected: boolean): void {
    if (this.ruptured || amount <= 0) return;
    const R = PHYSIO.risk;
    const w = (onBleb ? R.blebFactor : 1) * (neckDissected ? 1 : R.undissectedFactor);
    this.risk = Math.min(1, this.risk + amount * w * R.perStress);
    this.acute += amount * w;
  }

  /** True once when the risk first passes the warning level (for a mentor warning). */
  takeWarning(): boolean {
    if (this.warned || this.risk < PHYSIO.risk.warnAt) return false;
    this.warned = true;
    return true;
  }

  /** Normalized acute stress 0..1 (drives the dome's visible flush). */
  get acuteLevel(): number {
    return Math.min(1, this.acute / PHYSIO.risk.acuteScale);
  }

  /** Returns true on the frame the aneurysm ruptures. */
  update(dt: number): boolean {
    const R = PHYSIO.risk;
    this.acute *= Math.exp(-dt / R.acuteSec);
    if (this.ruptured) return false;
    const over = Math.max(0, this.risk - R.threshold) / (1 - R.threshold);
    const hazard = over * over * (0.01 + 3 * this.acuteLevel);
    if (this.rng() < 1 - Math.exp(-hazard * dt)) {
      this.ruptured = true;
      return true;
    }
    return false;
  }
}
