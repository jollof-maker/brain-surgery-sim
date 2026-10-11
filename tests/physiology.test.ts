import { describe, expect, it } from 'vitest';
import { ecgWave } from '../src/core/pulse';
import { Crisis } from '../src/procedure/crisis';
import { aneurysmInflow } from '../src/physics/occlusion';
import { PHYSIO } from '../src/physics/physiology';
import { RuptureModel } from '../src/physics/rupture';
import { VitalsModel } from '../src/physics/vitals';

const still = () => 0.5; // drift-free, deterministic rng

/** Small seeded PRNG (mulberry32) for reproducible stochastic tests. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function run(v: VitalsModel, seconds: number, inp: Parameters<VitalsModel['update']>[1]) {
  for (let t = 0; t < seconds; t += 0.1) v.update(0.1, inp);
}

describe('vitals model', () => {
  it('stays near baseline with no blood loss', () => {
    const v = new VitalsModel(still);
    run(v, 60, { ebl: 0, icaOccluded: false, sinceRupture: null });
    expect(v.hr).toBeCloseTo(PHYSIO.baseline.hr, 0);
    expect(v.sys).toBeCloseTo(PHYSIO.baseline.sys, 0);
    expect(v.alarms()).toEqual([]);
  });

  it('responds to hemorrhage with tachycardia and hypotension', () => {
    const v = new VitalsModel(still);
    run(v, 60, { ebl: 1500, icaOccluded: false, sinceRupture: null });
    expect(v.hr).toBeGreaterThan(110);
    expect(v.sys).toBeLessThan(85);
    expect(v.alarms()).toEqual(expect.arrayContaining(['hrHigh', 'bpLow']));
  });

  it('keeps MEP until the tolerated occlusion time, then it falls and recovers on release', () => {
    const v = new VitalsModel(still);
    const occluded = { ebl: 0, icaOccluded: true, sinceRupture: null };
    run(v, v.safeOcclusionSec() - 5, occluded);
    expect(v.mep).toBeGreaterThan(99);
    expect(v.alarms()).toContain('occlusionWarn');
    run(v, 90, occluded);
    expect(v.mep).toBeLessThan(PHYSIO.mep.alarmBelow);
    expect(v.alarms()).toEqual(expect.arrayContaining(['mepDrop', 'occlusionLong']));
    run(v, 90, { ebl: 0, icaOccluded: false, sinceRupture: null });
    expect(v.mep).toBeGreaterThan(95);
    expect(v.occlusionSec).toBe(0);
    expect(v.maxOcclusionSec).toBeGreaterThan(300);
  });

  it('tolerates less occlusion when blood pressure is low', () => {
    const v = new VitalsModel(still);
    run(v, 60, { ebl: 1200, icaOccluded: false, sinceRupture: null });
    expect(v.safeOcclusionSec()).toBeLessThan(PHYSIO.tempClip.safeSec);
  });
});

describe('rupture model', () => {
  it('never ruptures with gentle handling of the dome body', () => {
    const r = new RuptureModel(() => 0); // worst-case rng: any positive hazard ruptures
    for (let i = 0; i < 600; i++) { // 60 s of gentle contact
      r.stress(0.1, false, true);
      expect(r.update(0.1)).toBe(false);
    }
    expect(r.risk).toBeLessThan(PHYSIO.risk.threshold);
  });

  it('ruptures within a few seconds of rough handling of the bleb', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = new RuptureModel(seeded(seed));
      let t = 0;
      while (!r.ruptured && t < 20) {
        r.stress(30 * 0.05, true, false); // rough scrubbing, neck not yet dissected
        r.update(0.05);
        t += 0.05;
      }
      expect(r.ruptured).toBe(true);
      expect(t).toBeLessThan(5);
    }
  });

  it('warns once before the rupture zone', () => {
    const r = new RuptureModel(() => 1);
    r.stress(PHYSIO.risk.warnAt / PHYSIO.risk.perStress + 1, false, true);
    expect(r.takeWarning()).toBe(true);
    expect(r.takeWarning()).toBe(false);
  });
});

describe('temporary occlusion', () => {
  it('only proximal control reduces aneurysm inflow; trapping nearly stops it', () => {
    expect(aneurysmInflow([])).toBe(1);
    expect(aneurysmInflow([{ proximal: false }])).toBe(1);
    expect(aneurysmInflow([{ proximal: true }])).toBe(PHYSIO.tempClip.proximalInflow);
    expect(aneurysmInflow([{ proximal: true }, { proximal: false }])).toBe(PHYSIO.tempClip.trappedInflow);
  });
});

describe('rupture protocol', () => {
  it('ticks steps in order and resolves after the temporary clip is released', () => {
    const c = new Crisis();
    const v = { ruptured: true, aspiratedSinceRupture: 0, poolBelowICA: false, proximalControl: false, clipApplied: false, tempClipsOn: false };
    c.update(v);
    expect(c.active).toBe(true);
    expect(c.next()).toBe('clearField');
    c.update({ ...v, aspiratedSinceRupture: 5, poolBelowICA: true, proximalControl: true, tempClipsOn: true });
    expect(c.next()).toBe('definitiveClip');
    c.update({ ...v, clipApplied: true, tempClipsOn: true });
    expect(c.active).toBe(true);
    c.update({ ...v, clipApplied: true, tempClipsOn: false });
    expect(c.active).toBe(false);
  });
});

describe('ECG', () => {
  it('has its R wave about 0.2 cycle before the arterial pulse peak', () => {
    let best = 0, at = 0;
    for (let i = 0; i < 1000; i++) {
      const e = ecgWave(i / 1000);
      if (e > best) { best = e; at = i / 1000; }
    }
    expect(at).toBeCloseTo(0.93, 2);
    expect(best).toBeGreaterThan(0.9);
  });
});
