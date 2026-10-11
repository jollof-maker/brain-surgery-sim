import * as THREE from 'three';
import { buildInstrument } from '../tools/instruments';

/** Lens angle of the endoscope (a 30° scope looks off its own axis). */
const LENS_DEG = 30;

/**
 * Endoscope-assisted inspection. The scope is parked next to the aneurysm and
 * its image is injected into the microscope view (picture-in-picture inside
 * the eyepiece), showing what the microscope cannot see: the far side of the
 * neck, where clip tips can catch the PCom, the AChA or perforators.
 */
export class EndoscopeView {
  readonly camera = new THREE.PerspectiveCamera(78, 1, 0.2, 80);
  inserted = false;
  /** Seconds the current view has been held still. */
  viewTime = 0;
  private readonly light = new THREE.PointLight(0xfff4ea, 0, 40, 1.4);
  private readonly scope: THREE.Group;
  private readonly axis = new THREE.Vector3();
  private readonly u = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private phi = 0;
  private readonly frame: HTMLElement;
  private rect = { x: 0, y: 0, d: 0 };

  constructor(private readonly scene: THREE.Scene) {
    // The light is always in the scene (intensity 0 when idle) so the light count never changes.
    scene.add(this.light);
    this.scope = buildInstrument('endoscope').root;
    this.scope.traverse((o) => {
      o.userData = { kind: 'endoscope' };
      o.castShadow = true;
    });
    this.scope.visible = false;
    scene.add(this.scope);
    document.body.insertAdjacentHTML('beforeend', '<div id="endo-frame"><div class="hole"></div><span class="label">ENDOSCOPE 30°</span></div>');
    this.frame = document.getElementById('endo-frame')!;
    window.addEventListener('resize', () => this.layout());
    this.layout();
  }

  pickables(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    if (this.inserted) this.scope.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o); });
    return out;
  }

  /**
   * Parks the scope with its tip at `tip`, shaft along `toHand` (unit vector from
   * the tip toward the surgeon's hand). The 30° lens is first turned toward `lookAt`.
   */
  insert(tip: THREE.Vector3, toHand: THREE.Vector3, lookAt: THREE.Vector3): void {
    this.inserted = true;
    this.viewTime = 0;
    this.axis.copy(toHand).negate().normalize();
    this.u.set(0, 0, 1).cross(this.axis);
    if (this.u.lengthSq() < 1e-6) this.u.set(1, 0, 0).cross(this.axis);
    this.u.normalize();
    this.v.crossVectors(this.axis, this.u);
    // Point the oblique lens toward the target.
    const want = lookAt.clone().sub(tip);
    this.phi = Math.atan2(want.dot(this.v), want.dot(this.u));
    this.scope.position.copy(tip);
    const y = toHand.clone().normalize();
    const x = this.u.clone().addScaledVector(y, -this.u.dot(y)).normalize();
    this.scope.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)));
    this.scope.visible = true;
    this.frame.classList.add('on');
    this.aim(tip);
  }

  withdraw(): void {
    this.inserted = false;
    this.scope.visible = false;
    this.frame.classList.remove('on');
  }

  /** Turns the 30° lens around the scope axis. */
  rotate(deg: number): void {
    if (!this.inserted) return;
    this.phi += THREE.MathUtils.degToRad(deg);
    this.viewTime = 0;
    this.aim(this.scope.position);
  }

  private aim(tip: THREE.Vector3): void {
    const a = THREE.MathUtils.degToRad(LENS_DEG);
    const side = this.u.clone().multiplyScalar(Math.cos(this.phi)).addScaledVector(this.v, Math.sin(this.phi));
    const dir = this.axis.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
    this.camera.position.copy(tip).addScaledVector(this.axis, 0.3);
    this.camera.up.copy(this.axis).negate(); // image "up" toward the shaft, as on the endoscope tower
    this.camera.lookAt(this.camera.position.clone().add(dir));
    this.camera.updateMatrixWorld();
    this.light.position.copy(this.camera.position);
  }

  /** Whether a world point is in the endoscope's field of view and within reach of its light. */
  sees(p: THREE.Vector3, maxDist = 18): boolean {
    if (!this.inserted || p.distanceTo(this.camera.position) > maxDist) return false;
    const v = p.clone().project(this.camera);
    return v.z < 1 && Math.abs(v.x) < 0.9 && Math.abs(v.y) < 0.9;
  }

  /** Picture-in-picture position: inside the lower-left part of the eyepiece circle. */
  private layout(): void {
    const W = window.innerWidth, H = window.innerHeight, vmin = Math.min(W, H) / 100;
    const d = 26 * vmin;
    const cx = W / 2 - 25 * vmin, cy = H / 2 + 18 * vmin;
    this.rect = { x: cx - d / 2, y: cy - d / 2, d };
    Object.assign(this.frame.style, { left: `${this.rect.x}px`, top: `${this.rect.y}px`, width: `${d}px`, height: `${d}px` });
  }

  /** Renders the endoscope image over the already-composited microscope frame. */
  render(renderer: THREE.WebGLRenderer, hide: THREE.Object3D[]): void {
    if (!this.inserted) return;
    const { x, y, d } = this.rect;
    const H = renderer.domElement.clientHeight;
    const prev = { tone: renderer.toneMapping, exposure: renderer.toneMappingExposure, autoClear: renderer.autoClear };
    // Reuse the microscope light's shadow map rather than re-rendering it for the inset.
    const shadowAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    const vis = hide.map((o) => o.visible);
    hide.forEach((o) => { o.visible = false; });
    this.scope.visible = false;
    this.light.intensity = 80;
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();

    renderer.setRenderTarget(null);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.autoClear = false;
    renderer.setScissorTest(true);
    renderer.setScissor(x, H - y - d, d, d);
    renderer.setViewport(x, H - y - d, d, d);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    renderer.render(this.scene, this.camera);

    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, renderer.domElement.clientWidth, H);
    renderer.toneMapping = prev.tone;
    renderer.toneMappingExposure = prev.exposure;
    renderer.autoClear = prev.autoClear;
    renderer.shadowMap.autoUpdate = shadowAuto;
    this.light.intensity = 0;
    this.scope.visible = true;
    hide.forEach((o, i) => { o.visible = vis[i]; });
  }
}
