import * as THREE from 'three';
import type { Anatomy } from '../anatomy/Anatomy';
import { ANATOMY } from '../anatomy/config';
import type { LobeId, SimState, ToolId } from '../core/SimState';
import type { BleedingSystem } from '../physics/bleeding';
import { CLIP_OK, type ClipFrame } from '../physics/clipEval';
import type { Clipping } from '../physics/Clipping';
import type { Stage } from '../scene/Stage';
import { applyClipPose, clipPose } from '../tools/clip';
import type { ToolManager } from '../tools/ToolManager';
import { t } from '../ui/i18n';

class Cancelled extends Error {}

interface Deps {
  state: SimState;
  anatomy: Anatomy;
  bleeding: BleedingSystem;
  tools: ToolManager;
  stage: Stage;
  clipping: Clipping;
}

type Pt = { x: number; y: number };

/**
 * Demo mode: plays the whole procedure through the SAME tool code a learner
 * uses — a virtual pointer moves, presses and drags while captions explain each
 * step. Every step checks the current state first, so the demo can start at any
 * point and continues from wherever the case is. Any click, key or wheel by
 * the user ends it and hands control back exactly where it stopped.
 */
export class DemoDirector {
  active = false;
  private time = 0;
  private startedAt = 0;
  private waits: { until: number; resolve: () => void; reject: (e: Error) => void }[] = [];
  private ghost: Pt = { x: 0, y: 0 };
  private readonly ghostEl: HTMLElement;
  private readonly captionEl: HTMLElement;
  private caption = '';

  constructor(private readonly d: Deps) {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="demo-ghost"></div>
      <div id="demo-caption" class="panel"><span class="tag">DEMO</span><span class="text"></span><span class="hint"></span></div>`);
    this.ghostEl = document.getElementById('demo-ghost')!;
    this.captionEl = document.getElementById('demo-caption')!;
    const takeOver = (e: Event) => {
      if (!this.active || !e.isTrusted || performance.now() - this.startedAt < 400) return;
      if ((e.target as HTMLElement).closest?.('#lang-toggle')) return; // switching language keeps the demo going
      this.cancel();
    };
    for (const type of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(type, takeOver, { capture: true });
    d.state.bus.on('langChanged', () => this.renderCaption());
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.startedAt = performance.now();
    const r = this.d.stage.renderer.domElement.getBoundingClientRect();
    this.ghost = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    this.d.tools.enabled = true;
    this.d.tools.setVirtual(true);
    this.d.tools.virtualMove(this.ghost.x, this.ghost.y);
    document.body.classList.add('demo');
    this.run()
      .then(() => this.d.state.toast('demo.finished', 'good'))
      .catch((e) => {
        if (e instanceof Cancelled) this.d.state.toast('demo.takeover', 'info');
        else console.warn('demo stopped:', e);
      })
      .finally(() => this.finish());
  }

  cancel(): void {
    if (!this.active) return;
    const waits = this.waits;
    this.waits = [];
    for (const w of waits) w.reject(new Cancelled());
  }

  private finish(): void {
    this.active = false;
    this.d.tools.virtualUp();
    this.d.tools.setVirtual(false);
    document.body.classList.remove('demo');
  }

  /** Called every frame (simulation time, so the demo keeps pace with the scene). */
  update(dt: number): void {
    if (!this.active) return;
    this.time += dt;
    const due = this.waits.filter((w) => w.until <= this.time);
    this.waits = this.waits.filter((w) => w.until > this.time);
    for (const w of due) w.resolve();
    this.ghostEl.style.transform = `translate(${this.ghost.x}px, ${this.ghost.y}px)`;
  }

  // ------------------------------------------------------------ primitives --

  private wait(sec: number): Promise<void> {
    return new Promise((resolve, reject) => this.waits.push({ until: this.time + sec, resolve, reject }));
  }

  private say(key: string): void {
    this.caption = key;
    this.renderCaption();
  }

  private renderCaption(): void {
    this.captionEl.querySelector('.text')!.textContent = this.caption ? t(`demo.${this.caption}`) : '';
    this.captionEl.querySelector('.hint')!.textContent = t('demo.hint');
  }

  private async tool(id: ToolId): Promise<void> {
    if (this.d.state.tool !== id) this.d.state.setTool(id);
    await this.wait(0.35);
  }

  private async camera(opts: Parameters<Stage['scope']['moveTo']>[0], settle = 1): Promise<void> {
    this.d.stage.scope.moveTo(opts);
    await this.wait(settle);
  }

  /** Smoothly moves the virtual pointer (eased) over `sec`. */
  private async move(p: Pt, sec = 0.55): Promise<void> {
    const from = { ...this.ghost };
    const t0 = this.time;
    for (;;) {
      const k = Math.min(1, (this.time - t0) / sec);
      const e = k * k * (3 - 2 * k);
      this.ghost = { x: from.x + (p.x - from.x) * e, y: from.y + (p.y - from.y) * e };
      this.d.tools.virtualMove(this.ghost.x, this.ghost.y);
      if (k >= 1) return;
      await this.wait(0);
    }
  }

  private async click(p: Pt): Promise<void> {
    await this.move(p);
    await this.wait(0.15);
    this.d.tools.virtualDown();
    await this.wait(0.12);
    this.d.tools.virtualUp();
    await this.wait(0.3);
  }

  private async hold(p: Pt, sec: number): Promise<void> {
    await this.move(p);
    this.d.tools.virtualDown();
    await this.wait(sec);
    this.d.tools.virtualUp();
    await this.wait(0.25);
  }

  private screen(v: THREE.Vector3): Pt {
    const p = v.clone().project(this.d.stage.scope.camera);
    const r = this.d.stage.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  /** A pointer position where the active tool reaches `obj`, tilting the microscope if needed. */
  private async reach(obj: THREE.Object3D | undefined): Promise<Pt | null> {
    if (!obj) return null;
    const tilts: [number, number][] = [[14, 0], [-12, 0], [0, 12], [14, 10], [0, 0]];
    let p = this.d.tools.findReachablePoint(obj);
    for (const tilt of tilts) {
      if (p) return p;
      await this.camera({ tiltDeg: tilt }, 1.1);
      p = this.d.tools.findReachablePoint(obj);
    }
    return p;
  }

  // ------------------------------------------------------------ procedure --

  private async run(): Promise<void> {
    const { state, anatomy } = this.d;
    this.say('intro');
    await this.camera({ tiltDeg: [0, 0], field: 32 }, 2.5);

    // Stage 1 — open the sylvian fissure
    this.say('s1cut');
    await this.cutBand('sylvian');
    await this.coagulateAll();
    this.say('s1spatula');
    await this.tool('spatula');
    for (const lobe of ['frontal', 'temporal'] as LobeId[]) await this.seatSpatula(lobe);
    await this.coagulateAll();

    // Stage 2 — M1 and A1
    this.say('s2');
    await this.identify(['M1', 'A1']);

    // Stage 3 — carotid cistern, ICA and optic nerve
    this.say('s3cut');
    await this.cutBand('carotid');
    await this.coagulateAll();
    this.say('s3id');
    await this.identify(['ICA', 'optic']);

    // Stage 4 — PCom, AChA and the neck
    this.say('s4veil');
    await this.camera({ tiltDeg: [14, 0], field: 24 }, 1.2);
    await this.cutAdhesion('pcomVeil');
    this.say('s4id');
    await this.identify(['PCom', 'AChA']);
    this.say('s4neck');
    await this.strokeAdhesion('neckProximal');
    await this.strokeAdhesion('neckDistal');
    this.say('s4tether');
    await this.cutAdhesion('domeTether');

    // Stage 5 — clip
    this.say('s5aim');
    await this.applyClip();

    // Stage 6 — confirm
    this.say('s6icg');
    await this.tool('icg');
    await this.click(this.screen(anatomy.aneurysm.base));
    await this.wait(7);
    this.say('s6doppler');
    await this.tool('doppler');
    for (const id of ['PCom', 'AChA'] as const) {
      const p = await this.reach(anatomy.vessels.get(id)?.mesh);
      if (p) await this.hold(p, 1.5);
    }
    if (!state.flags.has('achaFlowConfirmed')) await this.endoscopeLook();
    this.say('done');
    await this.camera({ tiltDeg: [0, 0], field: 32 }, 2.5);
  }

  private async cutBand(band: 'sylvian' | 'carotid'): Promise<void> {
    await this.tool('scissors');
    for (const seg of this.d.anatomy.arachnoid.filter((s) => s.band === band)) {
      if (seg.cut) continue;
      const p = await this.reach(this.d.stage.scene.getObjectByName(`arachnoid-${band}-${seg.index}`));
      if (p) await this.click(p);
    }
  }

  private async coagulateAll(): Promise<void> {
    const oozes = () => this.d.bleeding.sources.filter((s) => s.active && s.type === 'ooze');
    if (!oozes().length) return;
    this.say('coag');
    await this.tool('bipolar');
    for (const s of oozes()) await this.hold(this.screen(s.position), 0.9);
    // Clear what is left with suction.
    await this.tool('suction');
    for (const s of this.d.bleeding.sources.filter((b) => b.volume > 0.005)) await this.hold(this.screen(s.position), 0.6);
  }

  private async seatSpatula(lobe: LobeId): Promise<void> {
    const r = this.d.state.retraction[lobe];
    if (r.seated && r.value > 0.45) return;
    const cfg = ANATOMY.spatulas.find((s) => s.id === lobe)!;
    const tip = new THREE.Vector3(...cfg.tip);
    const outward = new THREE.Vector3(0, lobe === 'frontal' ? 1 : -1, 0);
    // Start at the opercular edge and step outward until the pointer is on this lobe.
    let p: Pt | null = null;
    for (let k = 0; k < 12 && !p; k++) {
      const q = this.screen(tip.clone().addScaledVector(outward, k * 1.5));
      const { hit } = this.d.tools.poseAt(q.x, q.y);
      if (hit?.kind === 'brain' && hit.object.userData.id === lobe) p = q;
    }
    if (!p) return;
    // Drag ~2.5 mm away from the fissure: enough to hold it open, not to force it.
    const step = this.screen(tip.clone().add(outward)), base = this.screen(tip);
    const away = { x: p.x + (step.x - base.x) * 2.5, y: p.y + (step.y - base.y) * 2.5 };
    await this.move(p);
    this.d.tools.virtualDown();
    await this.wait(0.2);
    await this.move(away, 1.2); // gentle, steady retraction
    this.d.tools.virtualUp();
    await this.wait(0.3);
  }

  private async identify(ids: string[]): Promise<void> {
    await this.tool('dissector');
    for (const id of ids) {
      if (this.d.state.identified.has(id as never)) continue;
      const obj = this.d.anatomy.vessels.get(id as never)?.mesh ?? this.d.anatomy.nerves.get(id as never);
      const p = await this.reach(obj);
      if (p) await this.click(p);
    }
  }

  private adhesionMesh(id: string): THREE.Object3D | undefined {
    return this.d.anatomy.adhesions.get(id as never)?.mesh;
  }

  private async cutAdhesion(id: string): Promise<void> {
    if (this.d.anatomy.adhesions.get(id as never)?.freed) return;
    await this.tool('scissors');
    const p = await this.reach(this.adhesionMesh(id));
    if (p) await this.click(p);
  }

  /** Small, slow strokes along the neck (blunt dissection) until the band is free. */
  private async strokeAdhesion(id: string): Promise<void> {
    const adh = this.d.anatomy.adhesions.get(id as never);
    if (!adh || adh.freed) return;
    await this.tool('dissector');
    const p = await this.reach(adh.mesh);
    if (!p) return;
    await this.move(p);
    this.d.tools.virtualDown();
    const t0 = this.time;
    while (!adh.freed && this.time - t0 < 10) {
      const k = Math.sin((this.time - t0) * Math.PI * 2 * 1.2);
      this.ghost = { x: p.x + k * 10, y: p.y + k * 3 };
      this.d.tools.virtualMove(this.ghost.x, this.ghost.y);
      await this.wait(0);
    }
    this.d.tools.virtualUp();
    await this.wait(0.3);
  }

  /** Finds a clip pose that closes the neck and spares the branches, then shows Q/E and [ ] as a learner would use them. */
  private async applyClip(): Promise<void> {
    const { clipping, tools, state } = this.d;
    if (clipping.occluded && clipping.parentPatent) return;
    await this.tool('clip');
    if (state.clipVariant !== 'straight') state.setClipVariant('straight');
    const T = clipping.targets;
    const cam = this.d.stage.scope.camera.position;
    let best: { p: Pt; roll: number; depth: number; cost: number } | null = null;
    for (const ds of [0.3, 0.6, 1.0]) {
      const c = T.base.clone().addScaledVector(T.axis, T.sWall + ds);
      const toCam = cam.clone().sub(c).normalize();
      const radial = toCam.addScaledVector(T.axis, -toCam.dot(T.axis)).normalize();
      const side = radial.clone().cross(T.axis).normalize();
      for (const lat of [0, -0.6, 0.6, -1.0]) {
        const p = this.screen(c.clone().addScaledVector(radial, T.profile.neckR * 0.95).addScaledVector(side, lat));
        const { hit, pose } = tools.poseAt(p.x, p.y);
        if (hit?.kind !== 'aneurysm') continue;
        for (let roll = 0; roll < 360; roll += 15) {
          for (let depth = 3; depth <= 7; depth += 0.5) {
            const f: ClipFrame = { tip: pose.tip.clone(), x: pose.x.clone(), y: pose.y.clone(), z: pose.z.clone() };
            const e = clipping.preview('straight', applyClipPose(f, depth, roll));
            const bad = e.neckClosure < CLIP_OK.closure || e.icaNarrowing > 0.02 || Object.keys(e.branches).length || e.nerveContact;
            if (bad) continue;
            const cost = Math.abs(e.residualNeck - 0.5) + depth * 0.05;
            if (!best || cost < best.cost) best = { p, roll, depth, cost };
          }
        }
      }
    }
    if (!best) return;
    await this.move(best.p, 0.8);
    this.say('s5rotate');
    // Rotate and set depth step by step, like pressing Q/E and [ ].
    const rollSteps = ((best.roll - clipPose.roll) / 15 + 24) % 24;
    const key = rollSteps <= 12 ? 'e' : 'q';
    for (let i = 0; i < Math.min(rollSteps, 24 - rollSteps); i++) {
      tools.virtualKey(key);
      await this.wait(0.18);
    }
    while (Math.abs(clipPose.depth - best.depth) > 0.01) {
      tools.virtualKey(clipPose.depth < best.depth ? ']' : '[');
      await this.wait(0.15);
    }
    this.say('s5close');
    await this.wait(0.8);
    await this.click(best.p);
    await this.wait(0.8);
  }

  private async endoscopeLook(): Promise<void> {
    this.say('s6endo');
    await this.tool('endoscope');
    const b = this.d.clipping.targets.base;
    for (let a = 0; a < 16; a++) {
      const w = new THREE.Vector3(b.x + 10 * Math.cos(a * 0.39), b.y + 10 * Math.sin(a * 0.39), b.z - 2);
      const p = this.screen(w);
      const { hit } = this.d.tools.poseAt(p.x, p.y);
      if (hit?.kind !== 'brain' && hit?.kind !== 'floor') continue;
      await this.click(p);
      for (let turn = 0; turn < 12 && !this.d.state.flags.has('achaFlowConfirmed'); turn++) {
        await this.wait(1.8);
        this.d.tools.virtualKey('e');
      }
      return;
    }
  }
}
