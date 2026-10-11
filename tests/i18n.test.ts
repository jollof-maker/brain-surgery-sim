import { describe, expect, it } from 'vitest';
import { buildDebrief } from '../src/procedure/debrief';
import { t } from '../src/ui/i18n';

describe('i18n coverage', () => {
  it('has a label and teaching point for every debrief entry, in both languages', () => {
    const r = buildDebrief({
      complete: false, stageTimes: [], totalTime: 0, ebl: 900, ruptured: true, timeToProximal: null,
      occlusion: { total: 500, max: 500, safe: 300, warn: 240 }, minMep: 10,
      clip: { applied: true, closure: 0.5, residual: 3, narrowing: 0.5, pcom: 1, acha: 1, nerve: true, repositions: 9 },
      checks: { icg: false, pcom: false, acha: false },
      technique: { domeStress: 99, roughDissection: 9, unsafeActions: 9, retractionOverload: 1 },
    });
    const keys = [
      ...r.sections.flatMap((s) => [`debrief.section.${s.id}`, ...s.items.map((i) => `debrief.item.${i.id}`)]),
      ...r.sections.flatMap((s) => s.items.filter((i) => i.value.startsWith('@')).map((i) => i.value.slice(1))),
      ...r.points.map((p) => `debrief.pt.${p}`),
      'debrief.pt.excellent', 'debrief.pt.noClip',
    ];
    for (const k of keys) expect(t(k), k).not.toBe(k);
  });
});
