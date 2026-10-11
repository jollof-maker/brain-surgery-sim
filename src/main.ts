import * as THREE from 'three';
import { acceleratedRaycast } from 'three-mesh-bvh';
import './ui/styles.css';
import { Anatomy } from './anatomy/Anatomy';
import { AudioEngine } from './audio/AudioEngine';
import { SimState } from './core/SimState';
import { BleedingSystem } from './physics/bleeding';
import { updateRetraction } from './physics/retraction';
import { Stage } from './scene/Stage';
import { ToolManager } from './tools/ToolManager';
import { Shell } from './ui/Shell';
import { Toasts } from './ui/Toasts';
import { Toolbar } from './ui/Toolbar';

// Meshes with a BVH (brain lobes, floor) raycast in O(log n); others fall back to the default.
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const state = new SimState();
const container = document.getElementById('viewport')!;
const stage = new Stage(container);
const anatomy = new Anatomy();
const bleeding = new BleedingSystem();
const audio = new AudioEngine();
stage.scene.add(anatomy.root, bleeding.group);

const tools = new ToolManager(state, anatomy, bleeding, audio, stage);
let running = false;
const shell = new Shell(state, () => {
  running = true;
  audio.start();
  tools.enabled = true;
  toolbar.show(true);
});
const toolbar = new Toolbar(state);
toolbar.show(false);
new Toasts(state);

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

const timer = new THREE.Timer();
function frame(time: number): void {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.1);
  state.tick(dt);
  updateRetraction(state, anatomy, dt);
  anatomy.update(dt, state.pulse);
  bleeding.update(dt, state.pulse);
  stage.update(dt);
  tools.update(dt);
  shell.update(stage.scope);
  stage.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Exposed for debugging and the smoke test.
if (import.meta.env.DEV) {
  Object.assign(window, { __sim: { state, stage, anatomy, bleeding, tools } });
}
