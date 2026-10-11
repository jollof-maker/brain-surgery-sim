/**
 * Intraoperative rupture protocol, shown by the mentor as soon as the
 * aneurysm bleeds. The order matters and is a classic teaching sequence:
 *  1. clearField      — two suctions / keep the field visible; don't panic-clip blindly
 *  2. proximalControl — temporary clip on the ICA proximal to the aneurysm
 *  3. definitiveClip  — permanent clip across the neck (M5)
 *  4. releaseTemp     — remove temporary clips as soon as possible; note the time
 */
export const CRISIS_STEPS = ['clearField', 'proximalControl', 'definitiveClip', 'releaseTemp'] as const;
export type CrisisStep = (typeof CRISIS_STEPS)[number];

export interface CrisisView {
  ruptured: boolean;
  /** mL aspirated since the rupture. */
  aspiratedSinceRupture: number;
  /** Pool surface below the proximal ICA, so it can be seen and clipped. */
  poolBelowICA: boolean;
  proximalControl: boolean;
  clipApplied: boolean;
  tempClipsOn: boolean;
}

/** Steps tick once satisfied (sticky), like the stage tasks. */
export class Crisis {
  readonly done = new Set<CrisisStep>();

  get active(): boolean {
    return this.started && !this.done.has('releaseTemp');
  }

  started = false;

  update(v: CrisisView): void {
    if (!v.ruptured) return;
    this.started = true;
    if (v.aspiratedSinceRupture >= 3 && v.poolBelowICA) this.done.add('clearField');
    if (v.proximalControl) this.done.add('proximalControl');
    if (v.clipApplied) this.done.add('definitiveClip');
    if (v.clipApplied && !v.tempClipsOn) this.done.add('releaseTemp');
  }

  next(): CrisisStep | null {
    return CRISIS_STEPS.find((s) => !this.done.has(s)) ?? null;
  }

  signature(): string {
    return `${this.started}:${[...this.done].join()}`;
  }
}
