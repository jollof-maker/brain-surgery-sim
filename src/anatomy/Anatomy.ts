import * as THREE from 'three';
import { ANATOMY, type VesselId } from './config';
import { buildAneurysm, type AneurysmModel } from './aneurysm';
import { buildArachnoid, type ArachnoidSegment } from './arachnoid';
import { buildBrain, type BrainModel } from './brain';
import { tissueUniforms } from './materials';
import { buildNerves, type NerveId } from './nerves';
import { buildSpatulas } from './spatulas';
import { buildVessels, type VesselModel } from './vessels';

/** The whole operative field, assembled from config. */
export class Anatomy {
  readonly root = new THREE.Group();
  readonly brain: BrainModel;
  readonly vessels: Map<VesselId, VesselModel>;
  readonly aneurysm: AneurysmModel;
  readonly nerves: Map<NerveId, THREE.Mesh>;
  readonly arachnoid: ArachnoidSegment[];
  readonly spatulas: Map<string, THREE.Mesh>;

  constructor() {
    this.root.name = 'anatomy';
    this.brain = buildBrain();
    const v = buildVessels();
    this.vessels = v.vessels;
    this.aneurysm = buildAneurysm(ANATOMY.vessels.ICA.radius[0]);
    const n = buildNerves();
    this.nerves = n.nerves;
    const a = buildArachnoid();
    this.arachnoid = a.segments;
    const s = buildSpatulas();
    this.spatulas = s.spatulas;
    this.root.add(this.brain.group, v.group, this.aneurysm.mesh, n.group, a.group, s.group);
  }

  /** Called every frame with the arterial pulse (0..1). */
  update(pulse: number): void {
    tissueUniforms.uPulse.value = pulse;
  }

  /** Meshes the tools and the camera focus can hit. */
  pickables(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.visible) out.push(o);
    });
    return out;
  }
}
