import { ANATOMY } from '../anatomy/config';
import type { Anatomy } from '../anatomy/Anatomy';
import type { SimState } from '../core/SimState';

/**
 * Lobe retraction model.
 * - Without a spatula, each lobe settles to a "natural" opening that grows as
 *   the sylvian arachnoid is cut (gravity and CSF release let the fissure fall open).
 * - With a spatula, the lobe holds where the user set it, but never closer than natural.
 * - Maximum retraction is limited by the arachnoid still tethering the lobes.
 */
export function naturalRetraction(sylvianCut: number): number {
  const [closed, open] = ANATOMY.brain.natural;
  return closed + (open - closed) * sylvianCut;
}

export function retractionLimit(sylvianCut: number): number {
  const base = ANATOMY.brain.tetherBase;
  return base + (1 - base) * sylvianCut;
}

export function updateRetraction(state: SimState, anatomy: Anatomy, dt: number): void {
  const cut = anatomy.cutFraction('sylvian');
  const natural = naturalRetraction(cut);
  for (const lobe of ['frontal', 'temporal'] as const) {
    const r = state.retraction[lobe];
    if (!r.seated) r.value += (natural - r.value) * Math.min(1, dt * 1.5);
    else r.value = Math.max(r.value, natural);
    anatomy.brain.setRetraction(lobe, r.value);
  }
}
