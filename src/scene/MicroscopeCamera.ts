import * as THREE from 'three';
import { ANATOMY } from '../anatomy/config';

/**
 * Operating-microscope camera.
 *
 * A real microscope has a fixed working distance (~200–300 mm) and changes
 * magnification with a zoom lens, not by moving closer. So here:
 *   - the camera stays `workingDistance` mm from the focal point,
 *   - zoom changes the field of view (field diameter at the focal plane),
 *   - tilting is limited to a cone around the default viewing axis because
 *     the craniotomy and sylvian corridor only allow a few angles.
 *
 * Controls: right-drag tilt · shift+right-drag or middle-drag pan ·
 * wheel magnification · F focus at cursor · R reset.
 */
export class MicroscopeCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Current (smoothed) focal point. */
  readonly target = new THREE.Vector3();
  private goalTarget = new THREE.Vector3();
  private tilt = new THREE.Vector2(); // (yaw, pitch) in radians, smoothed
  private goalTilt = new THREE.Vector2();
  private field: number;
  private goalField: number;

  private readonly baseDir: THREE.Vector3;
  private readonly baseRight: THREE.Vector3;
  private readonly baseUp: THREE.Vector3;
  private readonly cfg = ANATOMY.microscope;

  private drag: { mode: 'tilt' | 'pan'; x: number; y: number } | null = null;

  constructor(private readonly dom: HTMLElement) {
    this.camera = new THREE.PerspectiveCamera(10, 1, 80, 600);
    this.baseDir = new THREE.Vector3(...this.cfg.viewDir).normalize();
    this.baseRight = new THREE.Vector3(0, 1, 0).cross(this.baseDir).normalize();
    this.baseUp = this.baseDir.clone().cross(this.baseRight).normalize();
    this.field = this.goalField = this.cfg.fieldInitial;
    this.reset(true);
    this.bind();
  }

  /** Field-of-view diameter at the focal plane, mm. */
  get fieldDiameter(): number {
    return this.field;
  }

  /** Nominal magnification shown on the HUD (≈ 200 mm / field diameter). */
  get magnification(): number {
    return 200 / this.field;
  }

  reset(immediate = false): void {
    this.goalTarget.set(...this.cfg.target);
    this.goalTilt.set(0, 0);
    this.goalField = this.cfg.fieldInitial;
    if (immediate) {
      this.target.copy(this.goalTarget);
      this.tilt.copy(this.goalTilt);
      this.field = this.goalField;
    }
  }

  /**
   * Scripted move (demo mode): focal point, tilt (yaw/pitch in degrees, within
   * the corridor limit) and field diameter, each optional. Smoothed like user moves.
   */
  moveTo(opts: { target?: THREE.Vector3; tiltDeg?: [number, number]; field?: number }): void {
    if (opts.target) this.goalTarget.copy(opts.target);
    if (opts.tiltDeg) {
      const max = this.cfg.maxTiltDeg;
      const [yaw, pitch] = opts.tiltDeg.map((d) => THREE.MathUtils.degToRad(THREE.MathUtils.clamp(d, -max, max)));
      this.goalTilt.set(yaw, pitch);
    }
    if (opts.field) this.goalField = THREE.MathUtils.clamp(opts.field, this.cfg.fieldMin, this.cfg.fieldMax);
  }

  focusOn(point: THREE.Vector3): void {
    this.goalTarget.copy(point);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt * 9); // critically-damped-ish smoothing
    this.target.lerp(this.goalTarget, k);
    this.tilt.lerp(this.goalTilt, k);
    this.field += (this.goalField - this.field) * k;

    const dir = this.baseDir.clone()
      .addScaledVector(this.baseRight, Math.tan(this.tilt.x))
      .addScaledVector(this.baseUp, Math.tan(this.tilt.y))
      .normalize();
    const wd = this.cfg.workingDistance;
    this.camera.position.copy(this.target).addScaledVector(dir, wd);
    this.camera.up.copy(this.baseUp);
    this.camera.lookAt(this.target);

    // Vertical FOV that shows `field` mm across the shorter screen dimension.
    const fieldV = this.camera.aspect >= 1 ? this.field : this.field / this.camera.aspect;
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(fieldV / 2 / wd));
    this.camera.updateProjectionMatrix();
  }

  private bind(): void {
    const el = this.dom;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      if (e.button === 2 || e.button === 1) {
        const mode = e.button === 1 || e.shiftKey ? 'pan' : 'tilt';
        this.drag = { mode, x: e.clientX, y: e.clientY };
        el.setPointerCapture(e.pointerId);
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      const px = Math.min(el.clientWidth, el.clientHeight);
      if (this.drag.mode === 'tilt') {
        this.goalTilt.x -= (dx / px) * 1.2;
        this.goalTilt.y += (dy / px) * 1.2;
        const max = THREE.MathUtils.degToRad(this.cfg.maxTiltDeg);
        if (this.goalTilt.length() > max) this.goalTilt.setLength(max);
      } else {
        const mmPerPx = this.field / px;
        const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
        this.goalTarget.addScaledVector(right, -dx * mmPerPx).addScaledVector(up, dy * mmPerPx);
        this.clampTarget();
      }
    });
    const end = (e: PointerEvent) => {
      if (this.drag) {
        this.drag = null;
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.goalField = THREE.MathUtils.clamp(
        this.goalField * Math.pow(1.0015, e.deltaY), this.cfg.fieldMin, this.cfg.fieldMax,
      );
    }, { passive: false });
  }

  /** Keep the focal point inside the operative field. */
  private clampTarget(): void {
    const c = new THREE.Vector3(...this.cfg.target);
    const off = this.goalTarget.clone().sub(c);
    if (off.length() > 30) this.goalTarget.copy(c).add(off.setLength(30));
  }
}
