import { describe, expect, it } from 'vitest';
import { ANATOMY } from '../src/anatomy/config';
import { naturalRetraction, retractionLimit } from '../src/physics/retraction';

describe('retraction model', () => {
  it('opens naturally as the sylvian arachnoid is cut', () => {
    expect(naturalRetraction(0)).toBeCloseTo(ANATOMY.brain.natural[0]);
    expect(naturalRetraction(1)).toBeCloseTo(ANATOMY.brain.natural[1]);
    expect(naturalRetraction(0.5)).toBeGreaterThan(naturalRetraction(0));
  });
  it('limits spatula retraction while the fissure is tethered', () => {
    expect(retractionLimit(0)).toBeCloseTo(ANATOMY.brain.tetherBase);
    expect(retractionLimit(1)).toBeCloseTo(1);
  });
  it('never limits retraction below the natural opening', () => {
    for (let c = 0; c <= 1; c += 0.1) expect(retractionLimit(c)).toBeGreaterThanOrEqual(naturalRetraction(c));
  });
});
