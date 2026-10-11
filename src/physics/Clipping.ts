import * as THREE from 'three';
import type { Anatomy } from '../anatomy/Anatomy';
import type { VesselId } from '../anatomy/config';
import type { ClipVariant, SimState } from '../core/SimState';
import { buildClip } from '../tools/instruments';
import type { BleedingSystem } from './bleeding';
import { buildClipTargets, CLIP_OK, combineEffects, evaluateClip, type ClipEffects, type ClipFrame } from './clipEval';
import { clipIschemia, computeFlow, type FlowMap, type FlowTarget } from './flow';
import type { Occlusion } from './occlusion';

export interface PermanentClip {
  id: string;
  variant: ClipVariant;
  frame: ClipFrame;
  effects: ClipEffects;
  appliedAt: number;
  mesh: THREE.Group;
}

/** Most clips a learner may leave in place (tandem clipping). */
const MAX_CLIPS = 3;

/**
 * Permanent clips: placement, combined evaluation, the flow model, and the
 * outcome flags read by the stage machine. Every change of clips (or of
 * temporary clips) recomputes flow, which in turn drives Doppler, ICG,
 * rupture bleeding, vessel pulsation and branch ischemia (MEP).
 */
export class Clipping {
  readonly group = new THREE.Group();
  readonly clips: PermanentClip[] = [];
  readonly targets = buildClipTargets();
  effects: ClipEffects = combineEffects([]);
  flow: FlowMap;
  /** Increments on every change so confirmations can be invalidated. */
  version = 0;
  private nextId = 1;

  constructor(
    private readonly state: SimState,
    private readonly anatomy: Anatomy,
    private readonly bleeding: BleedingSystem,
    private readonly occlusion: Occlusion,
  ) {
    this.group.name = 'permanent-clips';
    this.flow = this.computeFlow();
    state.bus.on('tempClipApplied', () => this.recompute());
    state.bus.on('tempClipRemoved', () => this.recompute());
  }

  get neckDissected(): boolean {
    const a = this.anatomy.adhesions;
    return !!a.get('neckProximal')?.freed && !!a.get('neckDistal')?.freed;
  }

  get full(): boolean {
    return this.clips.length >= MAX_CLIPS;
  }

  /** Evaluates a pose without applying it (used by the debug probe). */
  preview(variant: ClipVariant, frame: ClipFrame): ClipEffects {
    return evaluateClip(frame, variant, this.targets, this.neckDissected);
  }

  apply(variant: ClipVariant, frame: ClipFrame, time: number): PermanentClip {
    const effects = this.preview(variant, frame);
    const { group } = buildClip(variant, false);
    const root = new THREE.Group();
    root.add(group);
    root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(frame.x, frame.y, frame.z));
    root.position.copy(frame.tip);
    const id = `clip${this.nextId++}`;
    root.traverse((o) => {
      o.userData = { kind: 'clip', id };
      o.castShadow = true;
    });
    this.group.add(root);
    const clip: PermanentClip = {
      id, variant, effects, appliedAt: time, mesh: root,
      frame: { tip: frame.tip.clone(), x: frame.x.clone(), y: frame.y.clone(), z: frame.z.clone() },
    };
    this.clips.push(clip);
    this.recompute();
    return clip;
  }

  remove(id: string): PermanentClip | null {
    const i = this.clips.findIndex((c) => c.id === id);
    if (i < 0) return null;
    const [clip] = this.clips.splice(i, 1);
    this.group.remove(clip.mesh);
    this.recompute();
    return clip;
  }

  pickables(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    this.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o); });
    return out;
  }

  /** Branch ischemia caused by the clips (feeds MEP). */
  ischemia(): number {
    return clipIschemia(this.effects);
  }

  get occluded(): boolean {
    return this.clips.length > 0 && this.effects.neckClosure >= CLIP_OK.closure && this.effects.residualNeck <= CLIP_OK.residual;
  }

  get parentPatent(): boolean {
    return this.effects.icaNarrowing < CLIP_OK.narrowing && !this.effects.branches.M1 && !this.effects.branches.A1;
  }

  private computeFlow(): FlowMap {
    const temps = this.occlusion.clips;
    return computeFlow({
      tempProximal: temps.some((c) => c.proximal),
      tempDistal: temps.some((c) => !c.proximal),
      clip: this.effects,
    });
  }

  private recompute(): void {
    const prevClips = this.version;
    this.effects = combineEffects(this.clips.map((c) => c.effects));
    this.flow = this.computeFlow();
    this.version = prevClips + 1;

    // Outcome flags reflect the clips currently in place.
    const f = this.state.flags;
    const set = (flag: Parameters<typeof f.add>[0], on: boolean) => (on ? f.add(flag) : f.delete(flag));
    set('clipApplied', this.clips.length > 0);
    set('neckOccluded', this.occluded);
    set('parentPatent', this.clips.length > 0 && this.parentPatent);
    // Any clip change means the result has to be checked again.
    for (const flag of ['icgDone', 'pcomFlowConfirmed', 'achaFlowConfirmed'] as const) f.delete(flag);

    // A ruptured sac stops bleeding once the neck is closed (and bleeds again if the clip comes off).
    for (const s of this.bleeding.sources) {
      if (s.type === 'arterial') s.active = this.effects.neckClosure < CLIP_OK.closure;
    }

    // Pulsation follows flow: a clipped sac goes slack, an occluded branch stops pulsing.
    const scale = (mat: THREE.Material, flow: number) => {
      const u = mat.userData;
      if (u.pulseAmp) u.pulseAmp.value = u.pulseBase * Math.min(1, flow);
    };
    scale(this.anatomy.aneurysm.mesh.material as THREE.Material, this.flow.aneurysm);
    for (const [id, v] of this.anatomy.vessels) scale(v.mesh.material as THREE.Material, this.flow[id]);
    this.deformNeck();
  }

  private restPositions: Float32Array | null = null;

  /**
   * Flattens the aneurysm wall between closed blades so the clip visibly
   * pinches the neck (recomputed from the rest shape for the current clips).
   */
  private deformNeck(): void {
    const geo = this.anatomy.aneurysm.mesh.geometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    this.restPositions ??= (pos.array as Float32Array).slice();
    (pos.array as Float32Array).set(this.restPositions);
    const p = new THREE.Vector3(), d = new THREE.Vector3();
    for (const c of this.clips) {
      const L = 7, { tip, x, y, z } = c.frame;
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i);
        d.copy(p).sub(tip);
        const ly = d.dot(y), lx = d.dot(x), lz = d.dot(z);
        if (ly < -0.4 || ly > L + 0.4) continue;
        // Squeeze toward the closing plane near the blades, blending out over ~1 mm.
        const k = 0.08 + 0.92 * THREE.MathUtils.smoothstep(Math.abs(lx), 0.5, 1.6);
        p.addScaledVector(z, lz * (k - 1));
        pos.setXYZ(i, p.x, p.y, p.z);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }

  // ---------------------------------------------------------------- checks --

  /** ICG angiography result (called once the dye has passed). */
  icgResult(): void {
    const s = this.state;
    if (!this.clips.length) {
      s.toast('msg.icgBaseline', 'info');
      return;
    }
    s.flags.add('icgDone');
    if (this.flow.aneurysm > 0.02) s.toast('msg.icgResidual', 'warn');
    else s.toast('msg.icgSacDark', 'good');
    if (this.effects.icaNarrowing >= CLIP_OK.narrowing) s.toast('msg.icgParentNarrow', 'danger');
    if (this.anatomy.adhesions.get('pcomVeil')?.freed) {
      if (this.flow.PCom >= 0.5) {
        s.flags.add('pcomFlowConfirmed');
        s.toast('msg.flowConfirmed', 'good', { name: 'struct.PCom' });
      } else {
        s.toast('msg.icgPcomPoor', 'danger');
      }
    }
    if (!s.flags.has('achaFlowConfirmed')) s.toast('msg.icgAchaHidden', 'info');
  }

  /** Doppler held on a vessel (or the sac) for a moment after clipping. */
  dopplerCheck(target: FlowTarget): void {
    const s = this.state;
    if (!this.clips.length) return;
    const flow = this.flow[target];
    if (target === 'aneurysm') {
      s.toast(flow > 0.03 ? 'msg.dopplerSacFlow' : 'msg.dopplerSacSilent', flow > 0.03 ? 'warn' : 'good');
      return;
    }
    if (flow < 0.3) {
      s.toast('msg.dopplerNoFlow', 'danger', { name: `struct.${target}` });
      return;
    }
    if (target === 'PCom') s.flags.add('pcomFlowConfirmed');
    if (target === 'AChA') s.flags.add('achaFlowConfirmed');
    s.toast('msg.flowConfirmed', 'good', { name: `struct.${target}` });
  }

  /** The endoscope has looked behind the clip at these branch origins. */
  endoscopeCheck(visible: VesselId[]): void {
    const s = this.state;
    if (!this.clips.length) return;
    if (this.effects.neckClosure < CLIP_OK.closure) s.toast('msg.endoResidual', 'warn');
    for (const id of visible) {
      if ((this.effects.branches[id] ?? 0) > 0) {
        s.toast('msg.endoCaught', 'danger', { name: `struct.${id}` });
      } else if (this.flow[id] >= 0.5) {
        if (id === 'PCom') s.flags.add('pcomFlowConfirmed');
        if (id === 'AChA') s.flags.add('achaFlowConfirmed');
        s.toast('msg.endoFree', 'good', { name: `struct.${id}` });
      }
    }
  }
}
