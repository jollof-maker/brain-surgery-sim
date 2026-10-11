import * as THREE from 'three';
import type { Anatomy } from '../anatomy/Anatomy';
import type { AudioEngine } from '../audio/AudioEngine';
import type { SimState, ToastLevel, ToolId } from '../core/SimState';
import type { BleedingSystem } from '../physics/bleeding';
import type { Stage } from '../scene/Stage';
import { bipolar } from './bipolar';
import { dissector } from './dissector';
import { buildInstrument, type Instrument } from './instruments';
import { clip, doppler, endoscope, icg, tempClip } from './pending';
import { scissors } from './scissors';
import { spatula } from './spatula';
import { suction } from './suction';
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
  ) {
    this.ctx = {
      state, anatomy, bleeding, audio, stage,
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
      this.client.set(e.clientX, e.clientY);
      this.inside = true;
    });
    el.addEventListener('pointerenter', () => { this.inside = true; });
    el.addEventListener('pointerleave', () => { if (!this.pressed) this.inside = false; });
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
    const objects = [...this.anatomy.pickables(), ...this.bleeding.group.children.filter((c) => c.visible && c.userData.kind)];
    for (const h of this.raycaster.intersectObjects(objects, false)) {
      const kind = h.object.userData.kind as HitKind;
      if (exclude.includes(kind)) continue;
      if (kind === 'arachnoid' && h.object.userData.segment?.cut) continue;
      if (kind === 'adhesion' && h.object.userData.adhesion?.freed) continue;
      if (kind === 'spatula' && this.state.tool !== 'spatula') continue;
      const normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 0, 1);
      if (normal.dot(this.raycaster.ray.direction) > 0) normal.negate(); // double-sided membranes
      return { object: h.object, point: h.point.clone(), normal, kind, id: h.object.userData.id };
    }
    return null;
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
    const cam = this.stage.scope.camera;
    const tip = hit
      ? hit.point.clone().addScaledVector(hit.normal, 0.15)
      : this.raycaster.ray.at(this.stage.scope.camera.position.distanceTo(this.stage.scope.target), new THREE.Vector3());
    const camRight = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const camUp = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const hand = cam.position.clone()
      .addScaledVector(camRight, this.behavior.hand === 'left' ? -75 : 75)
      .addScaledVector(camUp, -95);
    const y = hand.sub(tip).normalize();
    const x = camRight.clone().addScaledVector(y, -camRight.dot(y)).normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    this.cursor.position.copy(tip);
    this.cursor.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));

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
    if (this.justPressed) this.behavior.press?.(hit, this.ctx);
    if (this.pressed) this.behavior.hold?.({ hit, dt, screenDelta, tipDelta }, this.ctx);
    if (this.justReleased) this.behavior.release?.(this.ctx);
    this.justPressed = this.justReleased = false;
    this.lastClient.copy(this.client);
    this.lastTip.copy(tip);
    this.lastHitObject = hit?.object ?? null;
  }
}
