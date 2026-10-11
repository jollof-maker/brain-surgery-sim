import * as THREE from 'three';
import './ui/styles.css';
import { Anatomy } from './anatomy/Anatomy';
import { SimState } from './core/SimState';
import { Stage } from './scene/Stage';
import { Shell } from './ui/Shell';

const state = new SimState();
const container = document.getElementById('viewport')!;
const stage = new Stage(container);
const anatomy = new Anatomy();
stage.scene.add(anatomy.root);

let running = false;
const shell = new Shell(state, () => {
  running = true;
});

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
    const hit = stage.pick(ndc, anatomy.pickables().filter((o) => o.userData.kind !== 'arachnoid'));
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
  anatomy.update(state.pulse);
  stage.update(dt);
  shell.update(stage.scope);
  stage.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Exposed for debugging and the smoke test.
if (import.meta.env.DEV) {
  Object.assign(window, { __sim: { state, stage, anatomy } });
}
