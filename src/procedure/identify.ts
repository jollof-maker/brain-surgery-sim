import type { Anatomy } from '../anatomy/Anatomy';
import type { SimState } from '../core/SimState';
import type { BleedingSystem } from '../physics/bleeding';
import type { ProcedureView, StructureId } from './stages';

const STRUCTURES: StructureId[] = ['ICA', 'M1', 'M2sup', 'M2inf', 'A1', 'PCom', 'AChA', 'optic', 'oculomotor'];

export function isStructureId(id: unknown): id is StructureId {
  return STRUCTURES.includes(id as StructureId);
}

/**
 * When a structure counts as exposed (visible and free of arachnoid) and can be
 * positively identified. This mirrors the anatomy of the approach:
 *  - the sylvian arachnoid hides M1/M2 and the A1 above the carotid cistern,
 *  - the carotid cistern membrane covers the ICA, optic nerve and AChA,
 *  - the PCom has its own arachnoid veil, CN III is reached past the dome band.
 */
export function isExposed(id: StructureId, v: ProcedureView): boolean {
  switch (id) {
    case 'M1': case 'M2sup': case 'M2inf': case 'A1':
      return v.cutFraction('sylvian') >= 0.5;
    case 'ICA': case 'optic':
      return v.cutFraction('carotid') >= 0.5;
    case 'AChA':
      return v.cutFraction('carotid') >= 0.75;
    case 'PCom':
      return v.adhesionFreed('pcomVeil');
    case 'oculomotor':
      return v.adhesionFreed('domeTether');
  }
}

/** Read-only view of the live simulation for the stage machine. */
export function createProcedureView(state: SimState, anatomy: Anatomy, bleeding: BleedingSystem): ProcedureView {
  return {
    cutFraction: (b) => anatomy.cutFraction(b),
    adhesionFreed: (id) => anatomy.adhesions.get(id)?.freed ?? false,
    spatulaSeated: (l) => state.retraction[l].seated,
    activeBleeds: () => bleeding.sources.filter((s) => s.active).length,
    identified: (id) => state.identified.has(id),
    flag: (f) => state.flags.has(f),
  };
}

/** Gentle touch on a structure with the dissector (or, from M5, the Doppler probe). */
export function identifyStructure(state: SimState, view: ProcedureView, id: string): void {
  if (!isStructureId(id)) return;
  const name = `struct.${id}`;
  if (state.identified.has(id)) {
    state.toast('msg.alreadyIdentified', 'info', { name });
  } else if (!isExposed(id, view)) {
    state.toast('msg.notExposed', 'warn', { name });
  } else {
    state.identified.add(id);
    state.bus.emit('structureIdentified', { id });
    state.toast('msg.identified', 'good', { name });
  }
}
