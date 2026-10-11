import { describe, expect, it } from 'vitest';
import { StageMachine } from '../src/procedure/StageMachine';
import type { ProcedureFlag, ProcedureView, StructureId } from '../src/procedure/stages';

/** Mutable fake of the simulation for driving the stage machine. */
function fakeView() {
  const s = {
    sylvian: 0, carotid: 0, bleeds: 0,
    freed: new Set<string>(), seated: new Set<string>(), ids: new Set<StructureId>(), flags: new Set<ProcedureFlag>(),
  };
  const view: ProcedureView = {
    cutFraction: (b) => (b === 'sylvian' ? s.sylvian : s.carotid),
    adhesionFreed: (id) => s.freed.has(id),
    spatulaSeated: (l) => s.seated.has(l),
    activeBleeds: () => s.bleeds,
    identified: (id) => s.ids.has(id),
    flag: (f) => s.flags.has(f),
  };
  return { s, view };
}

describe('stage machine', () => {
  it('starts on stage 1 with later stages locked', () => {
    const m = new StageMachine(fakeView().view);
    expect(m.status(0)).toBe('active');
    expect(m.status(1)).toBe('locked');
    expect(m.overallProgress()).toBe(0);
  });

  it('does not unlock stage 2 until every stage-1 task is done', () => {
    const { s, view } = fakeView();
    const m = new StageMachine(view);
    s.sylvian = 1;
    s.bleeds = 1;
    s.seated.add('frontal').add('temporal');
    m.update(0.1);
    expect(m.current).toBe(0);
    expect(m.nextTask()).toBe('dryField');
    s.bleeds = 0;
    m.update(0.1);
    expect(m.current).toBe(1);
    expect(m.status(0)).toBe('done');
  });

  it('keeps a task done after its condition lapses', () => {
    const { s, view } = fakeView();
    const m = new StageMachine(view);
    s.sylvian = 1;
    m.update(0.1);
    expect(m.taskDone(0, 'dryField')).toBe(true);
    s.bleeds = 2;
    m.update(0.1);
    expect(m.taskDone(0, 'dryField')).toBe(true);
  });

  it('credits work done early when a stage activates, and completes the procedure', () => {
    const { s, view } = fakeView();
    const m = new StageMachine(view);
    let completed = false;
    m.bus.on('procedureComplete', () => { completed = true; });
    s.sylvian = 1; s.carotid = 1;
    s.seated.add('frontal').add('temporal');
    for (const id of ['M1', 'A1', 'ICA', 'optic', 'PCom', 'AChA'] as StructureId[]) s.ids.add(id);
    for (const id of ['pcomVeil', 'neckProximal', 'neckDistal', 'domeTether']) s.freed.add(id);
    m.update(0.1);
    expect(m.current).toBe(4); // waits at clipping
    for (const f of ['clipApplied', 'neckOccluded', 'parentPatent', 'icgDone', 'pcomFlowConfirmed', 'achaFlowConfirmed'] as ProcedureFlag[]) s.flags.add(f);
    m.update(0.1);
    expect(completed).toBe(true);
    expect(m.overallProgress()).toBe(1);
  });
});

describe('exposure rules', () => {
  it('requires the right membrane to be opened before identification', async () => {
    const { isExposed } = await import('../src/procedure/identify');
    const { s, view } = fakeView();
    expect(isExposed('M1', view)).toBe(false);
    s.sylvian = 0.5;
    expect(isExposed('M1', view)).toBe(true);
    expect(isExposed('ICA', view)).toBe(false);
    s.carotid = 0.75;
    expect(isExposed('ICA', view)).toBe(true);
    expect(isExposed('AChA', view)).toBe(true);
    expect(isExposed('PCom', view)).toBe(false);
    s.freed.add('pcomVeil');
    expect(isExposed('PCom', view)).toBe(true);
  });
});
