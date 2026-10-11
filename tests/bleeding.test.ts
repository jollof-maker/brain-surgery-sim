import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BleedingSystem } from '../src/physics/bleeding';

const up = new THREE.Vector3(0, 0, 1);

describe('bleeding system', () => {
  it('accumulates blood loss while an ooze is active', () => {
    const b = new BleedingSystem();
    b.add('ooze', new THREE.Vector3(), up, 1.2); // 1.2 mL/min
    for (let i = 0; i < 600; i++) b.update(0.1, 0); // 60 s
    expect(b.totalLoss).toBeCloseTo(1.2, 1);
  });

  it('suction removes pooled blood near the tip only', () => {
    const b = new BleedingSystem();
    const near = b.add('ooze', new THREE.Vector3(0, 0, 0), up, 1);
    const far = b.add('ooze', new THREE.Vector3(20, 0, 0), up, 1);
    for (let i = 0; i < 100; i++) b.update(0.1, 0);
    const before = far.volume;
    b.suction(new THREE.Vector3(0.5, 0, 0), 3, 1);
    expect(near.volume).toBeLessThan(0.005);
    expect(far.volume).toBe(before);
  });

  it('coagulation stops further loss', () => {
    const b = new BleedingSystem();
    const s = b.add('ooze', new THREE.Vector3(), up, 1);
    b.coagulate(s);
    const loss = b.totalLoss;
    for (let i = 0; i < 100; i++) b.update(0.1, 0);
    expect(b.totalLoss).toBe(loss);
    expect(b.nearest(new THREE.Vector3(), 2)).toBeNull();
  });
});
