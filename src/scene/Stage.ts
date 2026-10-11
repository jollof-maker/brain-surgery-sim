import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MicroscopeCamera } from './MicroscopeCamera';
import { MicroscopeFX } from './postfx';

/**
 * Renderer, scene, microscope camera, light and post-processing.
 * The microscope's light is coaxial (it travels down the optical path), so the
 * key light is a warm spotlight riding with the camera, aimed at the focal point.
 */
/** `?quality=low` disables MSAA and shadows and renders at 1× pixel ratio (weak GPUs, automated tests). */
export const LOW_QUALITY = new URLSearchParams(location.search).get('quality') === 'low';

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly scope: MicroscopeCamera;
  readonly fx: MicroscopeFX;
  private readonly light: THREE.SpotLight;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(LOW_QUALITY ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !LOW_QUALITY;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping; // tone mapping happens in post
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x000000);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.12;
    // Depth cue: structures deeper than the focal plane fall off into darkness,
    // as they do in the narrow, deep surgical corridor.
    this.scene.fog = new THREE.Fog(0x0d0403, 264, 315);

    this.scope = new MicroscopeCamera(this.renderer.domElement);
    this.scene.add(this.scope.camera);

    // Coaxial halogen/xenon light: warm, slightly offset from the optical axis.
    this.light = new THREE.SpotLight(0xffe4c4, 4.2, 0, THREE.MathUtils.degToRad(9), 0.65, 0);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    this.light.shadow.camera.near = 120;
    this.light.shadow.camera.far = 420;
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.05;
    this.scene.add(this.light, this.light.target);
    this.scene.add(new THREE.HemisphereLight(0xffe0d0, 0x200808, 0.08));

    this.fx = new MicroscopeFX(this.renderer, this.scene, this.scope, LOW_QUALITY);

    const resize = () => this.resize();
    window.addEventListener('resize', resize);
    resize();
  }

  private resize(): void {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.scope.setAspect(w / h);
    this.fx.setSize(w, h);
  }

  update(dt: number): void {
    this.scope.update(dt);
    const cam = this.scope.camera;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    this.light.position.copy(cam.position).addScaledVector(right, 18);
    this.light.target.position.copy(this.scope.target);
    // Light spot slightly wider than the visible field.
    const wd = cam.position.distanceTo(this.scope.target);
    this.light.angle = Math.atan((this.scope.fieldDiameter * 0.9) / wd);
    this.fx.update(this.scope);
  }

  render(dt: number): void {
    this.fx.render(dt);
  }

  /** Raycast from normalized device coordinates. */
  pick(ndc: THREE.Vector2, objects: THREE.Object3D[]): THREE.Intersection | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.scope.camera);
    return ray.intersectObjects(objects, false)[0] ?? null;
  }
}
