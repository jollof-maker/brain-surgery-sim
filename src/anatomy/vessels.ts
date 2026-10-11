import * as THREE from 'three';
import { ANATOMY, type VesselDef, type VesselId } from './config';
import { Materials } from './materials';
import { buildTube } from './tube';

/** A vessel as both a renderable mesh and a centerline usable by later physics (flow, clips, Doppler). */
export interface VesselModel {
  id: VesselId;
  curve: THREE.CatmullRomCurve3;
  radiusAt: (t: number) => number;
  mesh: THREE.Mesh;
}

export function buildVessel(def: VesselDef): VesselModel {
  const curve = new THREE.CatmullRomCurve3(def.points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const [r0, r1] = def.radius;
  const radiusAt = (t: number) => r0 + (r1 - r0) * t;
  // Branches start inside their parent, so only the ICA gets a start cap.
  const geo = buildTube(curve, radiusAt, {
    capStart: def.id === 'ICA', capEnd: def.id !== 'ICA', tubularSegments: Math.ceil(curve.getLength() * 4),
  });
  const mesh = new THREE.Mesh(geo, Materials.artery(def.pulse));
  mesh.name = def.id;
  mesh.userData = { kind: 'vessel', id: def.id };
  mesh.castShadow = mesh.receiveShadow = true;
  return { id: def.id, curve, radiusAt, mesh };
}

/**
 * Builds all arteries plus small smooth "junction" spheres where branches
 * leave the parent (carotid bifurcation, MCA bifurcation) so tubes blend.
 */
export function buildVessels(): { group: THREE.Group; vessels: Map<VesselId, VesselModel> } {
  const group = new THREE.Group();
  group.name = 'vessels';
  const vessels = new Map<VesselId, VesselModel>();
  for (const def of Object.values(ANATOMY.vessels) as VesselDef[]) {
    const v = buildVessel(def);
    vessels.set(def.id, v);
    group.add(v.mesh);
  }

  const junctions: { at: VesselId; t: number; r: number }[] = [
    { at: 'ICA', t: 1, r: ANATOMY.vessels.ICA.radius[1] * 1.0 }, // carotid bifurcation
    { at: 'M1', t: 1, r: ANATOMY.vessels.M1.radius[1] * 1.0 }, // MCA bifurcation
  ];
  for (const j of junctions) {
    const v = vessels.get(j.at)!;
    const s = new THREE.Mesh(new THREE.SphereGeometry(j.r, 32, 24), v.mesh.material);
    s.position.copy(v.curve.getPointAt(j.t));
    s.userData = { kind: 'vessel', id: j.at };
    s.castShadow = s.receiveShadow = true;
    group.add(s);
  }
  return { group, vessels };
}
