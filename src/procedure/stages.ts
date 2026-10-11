/**
 * Procedure stages for clipping a right IC-PC aneurysm via a transsylvian approach.
 * Each stage has sub-tasks whose checks read a ProcedureView (a read-only window
 * on the simulation), so the stage logic is pure and unit-testable.
 */

export type StructureId = 'ICA' | 'M1' | 'M2sup' | 'M2inf' | 'A1' | 'PCom' | 'AChA' | 'optic' | 'oculomotor';

/** Flags set by later milestones (clip evaluation, ICG, Doppler). */
export type ProcedureFlag =
  | 'clipApplied' | 'neckOccluded' | 'parentPatent'
  | 'icgDone' | 'pcomFlowConfirmed' | 'achaFlowConfirmed';

export interface ProcedureView {
  cutFraction(band: 'sylvian' | 'carotid'): number;
  adhesionFreed(id: 'neckProximal' | 'neckDistal' | 'pcomVeil' | 'domeTether'): boolean;
  spatulaSeated(lobe: 'frontal' | 'temporal'): boolean;
  /** Number of bleeding points still bleeding. */
  activeBleeds(): number;
  identified(id: StructureId): boolean;
  flag(f: ProcedureFlag): boolean;
}

export interface TaskDef {
  id: string;
  /** Live condition. Once true while its stage is active, the task stays done. */
  check(v: ProcedureView): boolean;
}

export interface StageDef {
  id: string;
  tasks: TaskDef[];
}

/** Proportion of each arachnoid band that counts as "opened". */
export const OPEN_SYLVIAN = 4 / 6;
export const OPEN_CAROTID = 3 / 4;

export const STAGES: StageDef[] = [
  {
    // Sharp opening of the sylvian arachnoid, hemostasis, then gentle spatulas.
    id: 'openFissure',
    tasks: [
      { id: 'cutSylvian', check: (v) => v.cutFraction('sylvian') >= OPEN_SYLVIAN },
      { id: 'dryField', check: (v) => v.cutFraction('sylvian') > 0 && v.activeBleeds() === 0 },
      { id: 'spatulas', check: (v) => v.spatulaSeated('frontal') && v.spatulaSeated('temporal') },
    ],
  },
  {
    // M1 is the guide: follow it medially to the carotid bifurcation.
    id: 'identifyM1',
    tasks: [
      { id: 'idM1', check: (v) => v.identified('M1') },
      { id: 'idA1', check: (v) => v.identified('A1') },
    ],
  },
  {
    // Open the carotid cistern; the optic nerve lies medial to the ICA.
    id: 'identifyICA',
    tasks: [
      { id: 'cutCarotid', check: (v) => v.cutFraction('carotid') >= OPEN_CAROTID },
      { id: 'idICA', check: (v) => v.identified('ICA') },
      { id: 'idOptic', check: (v) => v.identified('optic') },
    ],
  },
  {
    // Positively identify PCom and AChA before freeing both sides of the neck.
    id: 'pcomNeck',
    tasks: [
      { id: 'pcomVeil', check: (v) => v.adhesionFreed('pcomVeil') },
      { id: 'idPCom', check: (v) => v.identified('PCom') },
      { id: 'idAChA', check: (v) => v.identified('AChA') },
      { id: 'neckProximal', check: (v) => v.adhesionFreed('neckProximal') },
      { id: 'neckDistal', check: (v) => v.adhesionFreed('neckDistal') },
      { id: 'domeTether', check: (v) => v.adhesionFreed('domeTether') },
    ],
  },
  {
    id: 'clip',
    tasks: [
      { id: 'clipApplied', check: (v) => v.flag('clipApplied') },
      { id: 'neckOccluded', check: (v) => v.flag('neckOccluded') },
      { id: 'parentPatent', check: (v) => v.flag('parentPatent') },
    ],
  },
  {
    id: 'confirmPatency',
    tasks: [
      { id: 'icgDone', check: (v) => v.flag('icgDone') },
      { id: 'pcomFlow', check: (v) => v.flag('pcomFlowConfirmed') },
      { id: 'achaFlow', check: (v) => v.flag('achaFlowConfirmed') },
    ],
  },
];
