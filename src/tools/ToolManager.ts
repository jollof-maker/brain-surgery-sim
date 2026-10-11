import * as THREE from 'three';
import type { Anatomy } from '../anatomy/Anatomy';
import type { AudioEngine } from '../audio/AudioEngine';
import type { SimState, ToastLevel, ToolId } from '../core/SimState';
import type { BleedingSystem } from '../physics/bleeding';
import type { ClipFrame } from '../physics/clipEval';
import type { Clipping } from '../physics/Clipping';
import type { Occlusion } from '../physics/occlusion';
import type { EndoscopeView } from '../scene/EndoscopeView';
import type { IcgView } from '../scene/IcgView';
import type { Patient } from '../physics/Patient';
import type { Stage } from '../scene/Stage';
import { bipolar } from './bipolar';
import { dissector } from './dissector';
import { buildInstrument, type Instrument } from './instruments';
import { clip } from './clip';
import { doppler } from './doppler';
import { endoscope } from './endoscope';
import { icg } from './icg';
import { scissors } from './scissors';
import { spatula } from './spatula';
import { suction } from './suction';
import { tempClip } from './tempClip';
import type { Hit, HitKind, HoverClass, ToolBehavior, ToolContext } from './types';

const BEHAVIORS: Record<ToolId, ToolBehavior> = {
  suction, scissors, bipolar, dissector, spatula, clip, icg, doppler, endoscope, tempClip,
};

const HOVER_COLORS: Record<Exclude<HoverClass, 'none'>, number> = { valid: 0x5fe0b8, warn: 0xf2a33a };

/**
 * Routes left-button pointer input to the active tool:
 *  - raycasts the field once per frame,
 *  - poses the instrument model at the hit point, shaft toward the surgeon's hand,
 *  - outlines the hovered target (teal = intended target, amber = risky),
 *  - calls the tool's press / hold / release handlers.
 * Right/middle buttons stay with the microscope camera.
 */
export class ToolManager {
  private readonly ctx: ToolContext;
  private readonly cursor = new THREE.Group();
  private instrument: Instrument;
  private behavior: ToolBehavior;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private client = new THREE.Vector2();
  private lastClient = new THREE.Vector2();
  private inside = false;
  private pressed = false;
  private justPressed = false;
  private justReleased = false;
  private hit: Hit | null = null;
  private lastTip = new THREE.Vector3();
  private lastHitObject: THREE.Object3D | null = null;
  private jaw = 1;
  /** Bipolar coagulation flash. Always in the scene (intensity 0 when idle) so light count never changes. */
  private readonly glow = new THREE.PointLight(0xbfdcff, 0, 6, 2);
  private lastSaid = new Map<string, number>();
  enabled = false;

  constructor(
    private readonly state: SimState,
    private readonly anatomy: Anatomy,
    private readonly bleeding: BleedingSystem,
    private readonly audio: AudioEngine,
    private readonly stage: Stage,
    services: {
      identify: (id: string) => void; patient: Patient; occlusion: Occlusion;
      clipping: Clipping; icg: IcgView; endoscope: EndoscopeView;
    },
  ) {
    this.ctx = {
      state, anatomy, bleeding, audio, stage, ...services,
      pose: { tip: new THREE.Vector3(), x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) },
      say: (key, level = 'info', params) => this.say(key, level, params),
      pickUnder: (exclude) => this.pick(exclude),
    };
    this.cursor.name = 'instrument-cursor';
    stage.scene.add(this.cursor, this.glow);
    this.behavior = BEHAVIORS[state.tool];
    this.instrument = this.mountInstrument();
    state.bus.on('toolChanged', () => this.switchTool());
    state.bus.on('clipVariantChanged', () => this.switchTool());
    this.bindPointer(stage.renderer.domElement);
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || e.repeat && !['q', 'e', '[', ']'].includes(e.key.toLowerCase())) return;
      if (this.behavior.key?.(e.key.toLowerCase(), this.ctx)) e.preventDefault();
    });
  }

  /** The instrument model following the pointer (hidden by the endoscope while it renders). */
  get cursorObject(): THREE.Object3D {
    return this.cursor;
  }

  get hoverHit(): Hit | null {
    return this.hit;
  }

  private say(key: string, level: ToastLevel, params?: Record<string, string | number>): void {
    const now = performance.now();
    if (now - (this.lastSaid.get(key) ?? -1e9) < 2500) return;
    this.lastSaid.set(key, now);
    this.state.toast(key, level, params);
  }

  private mountInstrument(): Instrument {
    this.cursor.clear();
    const inst = buildInstrument(this.state.tool, this.state.clipVariant);
    inst.root.traverse((o) => { o.castShadow = true; });
    this.cursor.add(inst.root);
    return inst;
  }

  private switchTool(): void {
    if (this.pressed) this.behavior.release?.(this.ctx);
    this.pressed = false;
    this.audio.stopAll();
    this.behavior = BEHAVIORS[this.state.tool];
    this.instrument = this.mountInstrument();
    this.jaw = this.behavior.jaw?.released ?? 1;
  }

  private bindPointer(el: HTMLElement): void {
    el.addEventListener('pointermove', (e) => {
      if (this.virtual) return; // the demo owns the pointer until the user takes over
      this.client.set(e.clientX, e.clientY);
      this.inside = true;
    });
    el.addEventListener('pointerenter', () => { this.inside = true; });
    el.addEventListener('pointerleave', () => { if (!this.pressed && !this.virtual) this.inside = false; });
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.enabled) return;
      this.client.set(e.clientX, e.clientY);
      this.pressed = true;
      this.justPressed = true;
      el.setPointerCapture(e.pointerId);
    });
    const up = (e: PointerEvent) => {
      if (e.button !== 0 || !this.pressed) return;
      this.pressed = false;
      this.justReleased = true;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  /** Raycast through the pointer, skipping pass-through kinds and spent tissue. */
  private pick(exclude: HitKind[]): Hit | null {
    const el = this.stage.renderer.domElement;
    const r = el.getBoundingClientRect();
    this.ndc.set(((this.client.x - r.left) / r.width) * 2 - 1, -((this.client.y - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.stage.scope.camera);
    const objects = [
      ...this.anatomy.pickables(),
      ...this.bleeding.group.children.filter((c) => c.visible && c.userData.kind),
      ...this.ctx.occlusion.pickables(),
      ...this.ctx.clipping.pickables(),
      ...this.ctx.endoscope.pickables(),
    ];
    for (const h of this.raycaster.intersectObjects(objects, false)) {
      const kind = h.object.userData.kind as HitKind;
      if (exclude.includes(kind)) continue;
      if (kind === 'arachnoid' && h.object.userData.segment?.cut) continue;
      if (kind === 'adhesion' && h.object.userData.adhesion?.freed) continue;
      if (kind === 'spatula' && this.state.tool !== 'spatula') continue;
      if (kind === 'tempClip' && this.state.tool !== 'tempClip') continue;
      if (kind === 'clip' && this.state.tool !== 'clip') continue;
      if (kind === 'endoscope' && this.state.tool !== 'endoscope') continue;
      const normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 0, 1);
      if (normal.dot(this.raycaster.ray.direction) > 0) normal.negate(); // double-sided membranes
      return { object: h.object, point: h.point.clone(), normal, kind, id: h.object.userData.id };
    }
    return null;
  }

  /** Pose of the instrument for a hit (tip on the surface, y = shaft toward the hand), before tool adjustments. */
  private basePose(hit: Hit | null, out: ClipFrame): void {
    const cam = this.stage.scope.camera;
    const tip = hit
      ? hit.point.clone().addScaledVector(hit.normal, 0.15)
      : this.raycaster.ray.at(cam.position.distanceTo(this.stage.scope.target), new THREE.Vector3());
    const camRight = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const camUp = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const hand = cam.position.clone()
      .addScaledVector(camRight, this.behavior.hand === 'left' ? -75 : 75)
      .addScaledVector(camUp, -95);
    out.y.copy(hand.sub(tip).normalize());
    out.x.copy(camRight).addScaledVector(out.y, -camRight.dot(out.y)).normalize();
    out.z.crossVectors(out.x, out.y);
    out.tip.copy(tip);
  }

  /** Demo helper: the active tool's hit and unadjusted pose at a page pixel. */
  poseAt(x: number, y: number): { hit: Hit | null; pose: ClipFrame } {
    const saved = this.client.clone();
    this.client.set(x, y);
    const hit = this.pick(this.behavior.passThrough);
    const pose: ClipFrame = { tip: new THREE.Vector3(), x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3() };
    this.basePose(hit, pose);
    this.client.copy(saved);
    return { hit, pose };
  }

  // ---- virtual pointer (demo mode drives the same input path as the mouse) ----
  private virtual = false;

  setVirtual(on: boolean): void {
    this.virtual = on;
    if (on) this.inside = true;
    else if (this.pressed) { this.pressed = false; this.justReleased = true; }
  }

  virtualMove(x: number, y: number): void {
    this.client.set(x, y);
    this.inside = true;
  }

  virtualDown(): void {
    this.pressed = true;
    this.justPressed = true;
  }

  virtualUp(): void {
    if (!this.pressed) return;
    this.pressed = false;
    this.justReleased = true;
  }

  virtualKey(key: string): void {
    this.behavior.key?.(key, this.ctx);
  }

  /** Debug/test helper: what the active tool would hit at a page pixel. */
  probeAt(x: number, y: number): { kind: string; id?: string } | null {
    const saved = this.client.clone();
    this.client.set(x, y);
    const hit = this.pick(this.behavior.passThrough);
    this.client.copy(saved);
    return hit ? { kind: hit.kind, id: hit.id } : null;
  }

  /**
   * Debug/test helper: finds a screen point where the active tool's ray reaches
   * `object` first (so scripted scenarios click only reachable targets).
   */
  findReachablePoint(object: THREE.Object3D): { x: number; y: number } | null {
    const mesh = object as THREE.Mesh;
    const pos = mesh.geometry.attributes.position;
    const r = this.stage.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3();
    const saved = this.client.clone();
    const step = Math.max(1, Math.floor(pos.count / 400));
    // Prefer vertices near the middle of the buffer (centre of membranes).
    const order = [...Array(Math.ceil(pos.count / step)).keys()].map((i) => i * step)
      .sort((a, b) => Math.abs(a - pos.count / 2) - Math.abs(b - pos.count / 2));
    for (const i of order) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).project(this.stage.scope.camera);
      if (Math.abs(v.x) > 0.8 || Math.abs(v.y) > 0.8) continue;
      this.client.set(r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height);
      const hit = this.pick(this.behavior.passThrough);
      if (hit?.object === object) {
        const out = { x: this.client.x, y: this.client.y };
        this.client.copy(saved);
        return out;
      }
    }
    this.client.copy(saved);
    return null;
  }

  update(dt: number): void {
    const show = this.enabled && this.inside;
    this.cursor.visible = show;
    const outline = this.stage.fx.outline;
    if (!show) {
      outline.selection.clear();
      this.hit = null;
      return;
    }

    this.hit = this.pick(this.behavior.passThrough);
    const hit = this.hit;

    // Hover highlight
    outline.selection.clear();
    const cls = hit ? this.behavior.classify(hit, this.ctx) : 'none';
    if (hit && cls !== 'none') {
      outline.visibleEdgeColor.setHex(HOVER_COLORS[cls]);
      outline.selection.add(hit.object);
    }
    this.stage.renderer.domElement.style.cursor = this.instrument.root.children.length ? 'none' : 'crosshair';

    // Instrument pose: tip at the target, shaft toward the surgeon's hand.
    const pose = this.ctx.pose;
    this.basePose(hit, pose);
    const tip = pose.tip.clone();
    this.behavior.adjustPose?.(pose, this.ctx);
    this.cursor.position.copy(pose.tip);
    this.cursor.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(pose.x, pose.y, pose.z));

    // Jaws
    if (this.behavior.jaw) {
      const target = this.pressed ? this.behavior.jaw.pressed : this.behavior.jaw.released;
      this.jaw += (target - this.jaw) * Math.min(1, dt * 18);
      this.instrument.setOpen?.(this.jaw);
    }
    const glowing = this.pressed && !!this.instrument.glowAt && !!hit;
    this.glow.intensity = glowing ? 2.5 + Math.random() * 1.5 : 0;
    if (glowing) this.glow.position.copy(this.instrument.glowAt!).applyMatrix4(this.cursor.matrixWorld);

    // Dispatch
    const screenDelta = this.client.clone().sub(this.lastClient);
    const sameTarget = hit && hit.object === this.lastHitObject;
    const tipDelta = sameTarget ? tip.clone().sub(this.lastTip) : new THREE.Vector3();
    // Pooled blood hides everything beneath it: only suction works through it.
    const obscured = hit?.kind === 'blood' && hit.id === 'pool' && this.behavior.id !== 'suction';
    if (this.justPressed) {
      if (obscured) this.say('msg.bloodObscures', 'warn');
      else this.behavior.press?.(hit, this.ctx);
    }
    if (this.pressed && !obscured) this.behavior.hold?.({ hit, dt, screenDelta, tipDelta }, this.ctx);
    if (this.justReleased) this.behavior.release?.(this.ctx);
    this.justPressed = this.justReleased = false;
    this.lastClient.copy(this.client);
    this.lastTip.copy(tip);
    this.lastHitObject = hit?.object ?? null;
  }
}
