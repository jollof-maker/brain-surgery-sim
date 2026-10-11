import * as THREE from 'three';
import type { Anatomy } from '../anatomy/Anatomy';
import type { VesselId } from '../anatomy/config';
import type { FlowMap, FlowTarget } from '../physics/flow';

/** Total length of one ICG run (s). */
export const ICG_DURATION = 11;
/** Time at which the result is read (dye has reached every branch). */
const READ_AT = 5;
/** Dye front speed at normal flow (mm/s), slowed down for teaching. */
const SPEED = 22;

/** When the dye front enters each vessel (s after injection reaches the field). */
const START: Record<FlowTarget, number> = {
  ICA: 0.6, aneurysm: 1.0, PCom: 1.1, AChA: 1.3, M1: 1.4, A1: 1.5, M2sup: 0, M2inf: 0,
};

const vert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  void main() {
    vUv = uv;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const frag = /* glsl */ `
  uniform float uFront;     // mm along the vessel the dye has reached
  uniform float uIntensity; // 0..1 brightness (flow, wash-out)
  uniform float uScale;     // uv.x → mm
  varying vec2 vUv;
  varying vec3 vN;
  void main() {
    float along = vUv.x * uScale;
    float lit = (1.0 - smoothstep(uFront - 1.2, uFront, along)) * uIntensity;
    float shade = 0.55 + 0.45 * abs(vN.z);
    vec3 col = mix(vec3(0.025), vec3(1.7), lit) * shade;
    gl_FragColor = vec4(col, 1.0);
  }`;

function dyeMaterial(scale: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag,
    uniforms: { uFront: { value: 0 }, uIntensity: { value: 0 }, uScale: { value: scale } },
  });
}

/**
 * Indocyanine-green videoangiography. The microscope switches to its
 * near-infrared view: tissue goes dark, and the dye lights up the arteries in
 * the order blood reaches them. A securely clipped sac stays dark; a
 * residual neck fills; an occluded branch never lights up.
 */
export class IcgView {
  active = false;
  time = 0;
  private readonly saved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private readonly dye = new Map<FlowTarget, THREE.ShaderMaterial>();
  private readonly lengths = new Map<FlowTarget, number>();
  private readonly dark = new THREE.MeshBasicMaterial({ color: 0x0b0b0b });
  private readonly darkClear = new THREE.MeshBasicMaterial({ color: 0x151515, transparent: true, opacity: 0.08, depthWrite: false });
  private readonly overlay: HTMLElement;
  private flow: FlowMap | null = null;
  private read = false;

  constructor(
    private readonly scene: THREE.Scene,
    anatomy: Anatomy,
    private readonly getFlow: () => FlowMap,
    private readonly onResult: () => void,
  ) {
    for (const [id, v] of anatomy.vessels) {
      this.dye.set(id, dyeMaterial(12)); // tube uv.x = mm / 12
      this.lengths.set(id, v.curve.getLength());
    }
    this.dye.set('aneurysm', dyeMaterial(3)); // aneurysm uv.x = s / 3
    this.lengths.set('aneurysm', anatomy.aneurysm.profile.height);
    START.M2sup = START.M2inf = START.M1 + (this.lengths.get('M1') ?? 15) / SPEED;
    document.body.insertAdjacentHTML('beforeend', '<div id="icg-overlay"><span>ICG · NIR</span><span class="num" id="icg-time"></span></div>');
    this.overlay = document.getElementById('icg-overlay')!;
  }

  start(): void {
    if (this.active) return;
    this.flow = { ...this.getFlow() };
    this.active = true;
    this.read = false;
    this.time = 0;
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      this.saved.set(m, m.material);
      const kind = o.userData.kind;
      if (kind === 'vessel') m.material = this.dye.get(o.userData.id as VesselId)!;
      else if (kind === 'aneurysm') m.material = this.dye.get('aneurysm')!;
      else if (kind === 'arachnoid' || kind === 'adhesion') m.material = this.darkClear;
      else m.material = this.dark;
    });
    this.overlay.classList.add('on');
    document.body.classList.add('icg');
  }

  private stop(): void {
    for (const [m, mat] of this.saved) m.material = mat;
    this.saved.clear();
    this.active = false;
    this.overlay.classList.remove('on');
    document.body.classList.remove('icg');
  }

  update(dt: number): void {
    if (!this.active || !this.flow) return;
    this.time += dt;
    const t = this.time;
    const washout = t > 6 ? Math.exp(-(t - 6) / 2.5) : 1;
    for (const [id, mat] of this.dye) {
      const flow = this.flow[id];
      // Retrograde PCom filling (from the posterior circulation) arrives late.
      const start = START[id] + (id === 'PCom' && this.flow.ICA < 0.1 ? 1.5 : 0) + (flow < 0.5 ? 0.6 : 0);
      const speed = id === 'aneurysm' ? 4 * flow : SPEED * Math.max(0.15, flow);
      mat.uniforms.uFront.value = Math.max(0, t - start) * speed;
      const visible = flow > 0.02 ? Math.min(1, 0.25 + Math.sqrt(flow)) : 0;
      mat.uniforms.uIntensity.value = visible * washout * Math.min(1, Math.max(0, t - start) * 3);
    }
    document.getElementById('icg-time')!.textContent = `${t.toFixed(1)} s`;
    if (!this.read && t >= READ_AT) {
      this.read = true;
      this.onResult();
    }
    if (t >= ICG_DURATION) this.stop();
  }
}
