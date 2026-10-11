import { describe, expect, it } from 'vitest';
import { buildDebrief, type DebriefInput } from '../src/procedure/debrief';

const ideal: DebriefInput = {
  complete: true,
  stageTimes: [120, 40, 60, 150, 60, 40],
  totalTime: 470,
  ebl: 20,
  ruptured: false,
  timeToProximal: null,
  occlusion: { total: 0, max: 0, safe: 300, warn: 240 },
  minMep: 100,
  clip: { applied: true, closure: 1, residual: 0.4, narrowing: 0, pcom: 0, acha: 0, nerve: false, repositions: 0 },
  checks: { icg: true, pcom: true, acha: true },
  technique: { domeStress: 3, roughDissection: 0, unsafeActions: 0, retractionOverload: 0 },
};

describe('debrief', () => {
  it('scores a clean procedure at 100 with only praise', () => {
    const r = buildDebrief(ideal);
    expect(r.score).toBe(100);
    expect(r.grade).toBe('good');
    expect(r.points).toEqual(['excellent']);
  });

  it('puts the most serious problem first', () => {
    const r = buildDebrief({
      ...ideal,
      ebl: 180,
      clip: { ...ideal.clip, acha: 1 },
    });
    expect(r.points[0]).toBe('acha');
    expect(r.points).toContain('blood');
    expect(r.score).toBe(100 - 30 - 5);
  });

  it('grades a rupture with slow proximal control and long occlusion as poor', () => {
    const r = buildDebrief({
      ...ideal,
      ruptured: true,
      timeToProximal: null,
      ebl: 450,
      occlusion: { total: 400, max: 360, safe: 300, warn: 240 },
      minMep: 30,
    });
    expect(r.grade).toBe('poor');
    const safety = r.sections.find((s) => s.id === 'safety')!;
    expect(safety.items.find((i) => i.id === 'occlusion')!.grade).toBe('poor');
    expect(r.points.slice(0, 3)).toEqual(expect.arrayContaining(['rupture', 'occlusion', 'mep']));
  });

  it('heavily penalizes leaving without a clip', () => {
    const r = buildDebrief({ ...ideal, complete: false, clip: { ...ideal.clip, applied: false } });
    expect(r.points[0]).toBe('noClip');
    expect(r.score).toBeLessThanOrEqual(60);
  });
});
