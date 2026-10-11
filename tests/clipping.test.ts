import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildClipTargets, CLIP_OK, combineEffects, evaluateClip, segmentFraction, type ClipFrame } from '../src/physics/clipEval';
import { clipIschemia, computeFlow } from '../src/physics/flow';

const T = buildClipTargets();

/**
 * A clip across the neck: blades come in from the surgeon's side, the neck
 * axis runs between them (X = aneurysm axis), tip `depth` mm beyond the near
 * neck wall, blades crossing the axis at height `s` above the base.
 */
function neckClip(s: number, depth: number, lateral = 0): ClipFrame {
  const x = T.axis.clone();
  const toward = new THREE.Vector3(0.32, 0.18, 1).normalize();
  const y = toward.addScaledVector(x, -toward.dot(x)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  const center = T.base.clone().addScaledVector(x, s).addScaledVector(z, lateral);
  // near wall is at +R along y; the tip is pushed `depth` beyond it
  const R = T.profile.neckR;
  const tip = center.clone().addScaledVector(y, R - depth);
  return { tip, x, y, z };
}

describe('clip evaluation', () => {
  it('finds the neck leaving the ICA wall about one ICA radius from the centerline', () => {
    expect(T.sWall).toBeGreaterThan(1.5);
    expect(T.sWall).toBeLessThan(2.6);
  });

  it('a well-placed clip closes the neck without narrowing the ICA', () => {
    const e = evaluateClip(neckClip(T.sWall + 0.4, 2 * T.profile.neckR + 0.8), 'straight', T);
    expect(e.neckClosure).toBeGreaterThan(CLIP_OK.closure);
    expect(e.residualNeck).toBeLessThan(CLIP_OK.residual);
    expect(e.icaNarrowing).toBe(0);
    expect(e.branches.PCom ?? 0).toBe(0);
  });

  it('a shallow clip leaves a residual lumen at the far side', () => {
    const e = evaluateClip(neckClip(T.sWall + 0.4, 1.8), 'straight', T);
    expect(e.neckClosure).toBeLessThan(0.7);
  });

  it('a clip placed too low narrows the parent artery', () => {
    const e = evaluateClip(neckClip(T.sWall - 1.2, 2 * T.profile.neckR + 0.8), 'straight', T);
    expect(e.icaNarrowing).toBeGreaterThan(CLIP_OK.narrowing);
  });

  it('a clip placed high on the dome leaves a neck remnant', () => {
    const e = evaluateClip(neckClip(T.sWall + 3.5, 6), 'straight', T);
    expect(e.residualNeck).toBeGreaterThan(CLIP_OK.residual);
    expect(e.domeClip).toBe(true);
  });

  it('blades rotated parallel to the neck axis do not close it', () => {
    const f = neckClip(T.sWall + 0.4, 4.5);
    const rolled: ClipFrame = { tip: f.tip, x: f.z.clone(), y: f.y, z: f.x.clone().negate() };
    expect(evaluateClip(rolled, 'straight', T).neckClosure).toBeLessThan(0.5);
  });

  it('blades shifted toward the PCom/AChA side catch a branch', () => {
    const e = evaluateClip(neckClip(T.sWall + 0.4, 4.6, 1.7), 'straight', T);
    expect(Math.max(e.branches.PCom ?? 0, e.branches.AChA ?? 0)).toBeGreaterThan(0);
  });

  it('shifting slightly away from the PCom keeps the neck closed and the branches free', () => {
    const e = evaluateClip(neckClip(T.sWall + 0.4, 4.6, -0.8), 'straight', T);
    expect(e.neckClosure).toBeGreaterThan(CLIP_OK.closure);
    expect(Object.keys(e.branches)).toEqual([]);
  });

  it('segment fraction runs from 0 to 1 across the disk', () => {
    expect(segmentFraction(0, 2)).toBe(0);
    expect(segmentFraction(2, 2)).toBeCloseTo(0.5, 5);
    expect(segmentFraction(4, 2)).toBeCloseTo(1, 5);
  });
});

describe('flow model', () => {
  const none = combineEffects([]);
  it('everything flows with no clips', () => {
    const f = computeFlow({ tempProximal: false, tempDistal: false, clip: none });
    expect(f.aneurysm).toBe(1);
    expect(f.PCom).toBe(1);
    expect(f.AChA).toBe(1);
  });

  it('a closing clip stops the sac but keeps the branches', () => {
    const e = evaluateClip(neckClip(T.sWall + 0.4, 2 * T.profile.neckR + 0.8), 'straight', T);
    const f = computeFlow({ tempProximal: false, tempDistal: false, clip: combineEffects([e]) });
    expect(f.aneurysm).toBeLessThan(0.05);
    expect(f.PCom).toBeGreaterThan(0.9);
    expect(f.AChA).toBeGreaterThan(0.9);
  });

  it('a caught AChA loses flow and causes ischemia', () => {
    const e = { ...none, branches: { AChA: 1 } };
    expect(computeFlow({ tempProximal: false, tempDistal: false, clip: e }).AChA).toBe(0);
    expect(clipIschemia(e)).toBe(1);
  });

  it('the PCom keeps retrograde flow under a proximal temporary clip', () => {
    const f = computeFlow({ tempProximal: true, tempDistal: false, clip: none });
    expect(f.PCom).toBeGreaterThan(0.5);
    expect(f.AChA).toBe(0);
  });
});
