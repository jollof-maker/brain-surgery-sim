import * as THREE from 'three';
import { acceleratedRaycast } from 'three-mesh-bvh';
import './ui/styles.css';
import { Anatomy } from './anatomy/Anatomy';
import { AudioEngine } from './audio/AudioEngine';
import { SimState } from './core/SimState';
import { ANATOMY } from './anatomy/config';
import { BleedingSystem } from './physics/bleeding';
import { Clipping } from './physics/Clipping';
import { Occlusion } from './physics/occlusion';
import { Patient } from './physics/Patient';
import { Crisis } from './procedure/crisis';
import { createProcedureView, identifyStructure } from './procedure/identify';
import { StageMachine } from './procedure/StageMachine';
import { updateRetraction } from './physics/retraction';
import { EndoscopeView } from './scene/EndoscopeView';
import { IcgView } from './scene/IcgView';
import { Stage } from './scene/Stage';
import { ToolManager } from './tools/ToolManager';
import { Checklist } from './ui/Checklist';
import { DopplerHud } from './ui/DopplerHud';
import { Mentor } from './ui/Mentor';
import { Shell } from './ui/Shell';
import { Toasts } from './ui/Toasts';
import { Toolbar } from './ui/Toolbar';
import { VitalsPanel } from './ui/Vitals';

// Meshes with a BVH (brain lobes, floor) raycast in O(log n); others fall back to the default.
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const state = new SimState();
const container = document.getElementById('viewport')!;
const stage = new Stage(container);
const anatomy = new Anatomy();
const bleeding = new BleedingSystem();
const audio = new AudioEngine();
const occlusion = new Occlusion(anatomy);
const clipping = new Clipping(state, anatomy, bleeding, occlusion);
const patient = new Patient(state, anatomy, bleeding, occlusion, clipping);
const crisis = new Crisis();
stage.scene.add(anatomy.root, bleeding.group, occlusion.group, clipping.group);
const icg = new IcgView(stage.scene, anatomy, () => clipping.flow, () => clipping.icgResult());
const endoscope = new EndoscopeView(stage.scene);
// A changed clip has to be looked at again.
state.bus.on('clipApplied', () => { endoscope.viewTime = 0; });
state.bus.on('clipRemoved', () => { endoscope.viewTime = 0; });
state.bus.on('ruptured', () => audio.rush());

const view = createProcedureView(state, anatomy, bleeding);
const machine = new StageMachine(view);
machine.bus.on('stageCompleted', ({ stage: i }) => {
  state.toast('msg.stageComplete', 'good', { n: i + 1 });
  audio.chime();
});

const tools = new ToolManager(state, anatomy, bleeding, audio, stage, {
  identify: (id) => identifyStructure(state, view, id), patient, occlusion, clipping, icg, endoscope,
});
let running = false;
const shell = new Shell(state, () => {
  running = true;
  audio.start();
  tools.enabled = true;
  for (const p of panels) p.show(true);
});
const mentor = new Mentor(state, machine, crisis);
const vitalsPanel = new VitalsPanel(state, patient, audio);
const panels = [new Toolbar(state), new Checklist(state, machine), mentor, vitalsPanel];
for (const p of panels) p.show(false);
new Toasts(state);
const dopplerHud = new DopplerHud(state);

// Pointer position for focus-at-cursor (F).
const ndc = new THREE.Vector2();
container.addEventListener('pointermove', (e) => {
  const r = container.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
});
window.addEventListener('keydown', (e) => {
  if (!running || e.repeat) return;
  const key = e.key.toLowerCase();
  if (key === 'f') {
    const hit = stage.pick(ndc, anatomy.pickables().filter((o) => o.userData.kind !== 'arachnoid' && o.userData.kind !== 'adhesion'));
    if (hit) stage.scope.focusOn(hit.point);
  } else if (key === 'r') {
    stage.scope.reset();
  }
});

/** Feeds the rupture protocol checklist from the live state. */
let aspiratedAtRupture = 0;
state.bus.on('ruptured', () => { aspiratedAtRupture = bleeding.aspirated; });
const icaDeepZ = ANATOMY.vessels.ICA.points[0][2];
function updateCrisis(): void {
  crisis.update({
    ruptured: patient.ruptured,
    aspiratedSinceRupture: bleeding.aspirated - aspiratedAtRupture,
    poolBelowICA: bleeding.poolLevel() < icaDeepZ - 1,
    proximalControl: occlusion.proximalControl,
    clipApplied: state.flags.has('neckOccluded'),
    tempClipsOn: occlusion.icaOccluded,
  });
}

/** After the scope has looked steadily for a moment, report what it shows behind the clip. */
const branchOrigins = (['PCom', 'AChA'] as const).map((id) => ({ id, p: anatomy.vessels.get(id)!.curve.getPointAt(0.12) }));
function updateEndoscope(dt: number): void {
  if (!endoscope.inserted || icg.active) return;
  const before = endoscope.viewTime;
  endoscope.viewTime += dt;
  if (before < 1.5 && endoscope.viewTime >= 1.5) {
    const seen = branchOrigins.filter((b) => endoscope.sees(b.p)).map((b) => b.id);
    if (clipping.clips.length && !seen.length) state.toast('msg.endoNothing', 'info');
    clipping.endoscopeCheck(seen);
  }
}

const timer = new THREE.Timer();
function frame(time: number): void {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.1);
  state.tick(dt);
  updateRetraction(state, anatomy, dt);
  if (running) {
    machine.update(dt);
    patient.update(dt);
    updateCrisis();
  }
  anatomy.update(dt, state.pulse);
  bleeding.update(dt, state.pulse, patient.bleedEnv());
  audio.setSuctionWet(bleeding.lastAspirated < 0.15);
  vitalsPanel.update(dt);
  mentor.update();
  icg.update(dt);
  if (running) updateEndoscope(dt);
  dopplerHud.update();
  stage.update(dt);
  tools.update(dt);
  shell.update(stage.scope);
  stage.render(dt);
  endoscope.render(stage.renderer, state.tool === 'endoscope' ? [tools.cursorObject] : []);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Exposed for debugging and the smoke test.
if (import.meta.env.DEV) {
  Object.assign(window, { __sim: { state, stage, anatomy, bleeding, tools, machine, patient, occlusion, crisis, clipping, icg, endoscope } });
}
