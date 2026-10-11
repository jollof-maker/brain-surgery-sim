import * as THREE from 'three';
import type { LobeId } from '../core/SimState';
import { buildAdhesions, type Adhesion, type AdhesionId } from './adhesions';
import { buildAneurysm, type AneurysmModel } from './aneurysm';
import { buildArachnoid, type ArachnoidSegment } from './arachnoid';
import { buildBrain, type BrainModel } from './brain';
import { ANATOMY, type VesselId } from './config';
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
  readonly nerveCurves: Map<NerveId, THREE.CatmullRomCurve3>;
  readonly arachnoid: ArachnoidSegment[];
  readonly adhesions: Map<AdhesionId, Adhesion>;
  readonly spatulas: Map<LobeId, THREE.Mesh>;

  constructor() {
    this.root.name = 'anatomy';
    this.brain = buildBrain();
    const v = buildVessels();
    this.vessels = v.vessels;
    this.aneurysm = buildAneurysm(ANATOMY.vessels.ICA.radius[0]);
    const n = buildNerves();
    this.nerves = n.nerves;
    this.nerveCurves = n.curves;
    const a = buildArachnoid();
    this.arachnoid = a.segments;
    const ad = buildAdhesions(this.aneurysm, this.vessels, n.curves.get('oculomotor')!);
    this.adhesions = ad.adhesions;

    // Spatulas ride on their lobe so they move with retraction; hidden until seated.
    const s = buildSpatulas();
    this.spatulas = s.spatulas as Map<LobeId, THREE.Mesh>;
    for (const [lobe, mesh] of this.spatulas) {
      mesh.visible = false;
      this.brain.lobes[lobe].add(mesh);
    }
    this.root.add(this.brain.group, v.group, this.aneurysm.mesh, n.group, a.group, ad.group);
  }

  /** Called every frame. */
  update(dt: number, pulse: number): void {
    tissueUniforms.uPulse.value = pulse;
    for (const seg of this.arachnoid) seg.update(dt);
    for (const adh of this.adhesions.values()) adh.update(dt);
  }

  /** Fraction (0..1) of a band's segments that have been cut. */
  cutFraction(band: 'sylvian' | 'carotid'): number {
    const segs = this.arachnoid.filter((s) => s.band === band);
    return segs.filter((s) => s.cut).length / segs.length;
  }

  /** Meshes the tools and the camera focus can hit. */
  pickables(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    this.root.traverseVisible((o) => {
      if ((o as THREE.Mesh).isMesh && o.userData.kind) out.push(o);
    });
    return out;
  }
}
