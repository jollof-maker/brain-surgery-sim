import type { VesselId } from '../anatomy/config';
import { type ClipEffects } from './clipEval';
import { PHYSIO } from './physiology';

export type FlowTarget = VesselId | 'aneurysm';
/** Relative flow 0..1 (1 = normal) in each vessel and in the aneurysm sac. */
export type FlowMap = Record<FlowTarget, number>;

export interface FlowInput {
  tempProximal: boolean;
  tempDistal: boolean;
  clip: ClipEffects;
}

/**
 * Tiny flow graph of the operative field:
 *
 *   ICA(prox) ──┬── aneurysm  (minus neck closure; retrograde filling if only proximally clipped)
 *               ├── PCom      (also fed backward from the posterior circulation)
 *               └── ICA(dist) ──┬── AChA
 *                               ├── M1 ── M2s   (leptomeningeal collaterals keep a little)
 *                               └── A1          (cross-flow through the ACom)
 *
 * Values drive Doppler loudness/pitch, ICG filling, bleeding from a rupture
 * and branch ischemia (MEP).
 */
export function computeFlow(inp: FlowInput): FlowMap {
  const c = inp.clip;
  const icaIn = inp.tempProximal ? 0 : 1;
  const parent = 1 - Math.min(1, c.icaNarrowing * (c.icaNarrowing > 0.6 ? 1.6 : 1));
  const icaDist = icaIn * parent * (inp.tempDistal ? 0 : 1);
  const branch = (id: VesselId) => 1 - (c.branches[id] ?? 0);

  // Inflow into the sac: temporary clips (as in M4) times what the neck clip leaves open.
  const tempInflow = inp.tempProximal
    ? (inp.tempDistal ? PHYSIO.tempClip.trappedInflow : PHYSIO.tempClip.proximalInflow)
    : 1;
  const m1 = Math.max(icaDist, 0.15) * branch('M1');
  return {
    ICA: icaIn * (0.5 + 0.5 * parent),
    aneurysm: tempInflow * (1 - c.neckClosure),
    PCom: Math.max(icaIn * parent, 0.6) * branch('PCom'),
    AChA: icaDist * branch('AChA'),
    M1: m1,
    M2sup: m1 * branch('M2sup'),
    M2inf: m1 * branch('M2inf'),
    A1: Math.max(icaDist, 0.6) * branch('A1'),
  };
}

/**
 * Ischemic load 0..1 from the clip (not counting temporary-clip time, which
 * the vitals model handles): an occluded AChA is the classic disaster
 * (internal capsule), a narrowed ICA starves the MCA territory, and the PCom
 * gives thalamoperforators.
 */
export function clipIschemia(c: ClipEffects): number {
  const acha = c.branches.AChA ?? 0;
  const pcom = c.branches.PCom ?? 0;
  const ica = Math.max(0, c.icaNarrowing - 0.5) * 2;
  return Math.min(1, acha + 0.35 * pcom + ica + 0.6 * (c.branches.M1 ?? 0));
}
