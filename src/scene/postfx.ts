import * as THREE from 'three';
import {
  BloomEffect, DepthOfFieldEffect, EffectComposer, EffectPass, KernelSize, NoiseEffect, OutlineEffect, RenderPass,
  ToneMappingEffect, ToneMappingMode, VignetteEffect, BlendFunction,
} from 'postprocessing';
import type { MicroscopeCamera } from './MicroscopeCamera';

/**
 * The "looking through a microscope" look:
 *  - shallow depth of field that follows the focal point (depth of field
 *    shrinks as magnification rises),
 *  - soft bloom on wet specular highlights,
 *  - warm filmic tone mapping, faint sensor grain,
 *  - vignette (the circular eyepiece edge is an HTML overlay),
 *  - a thin outline on the target the current instrument is hovering.
 */
export class MicroscopeFX {
  readonly composer: EffectComposer;
  readonly dof: DepthOfFieldEffect;
  /** Hover highlight for tool targets (selection is managed by the ToolManager). */
  readonly outline: OutlineEffect;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, scope: MicroscopeCamera, low = false) {
    const cam = scope.camera;
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: low ? 0 : 4 });
    this.composer.addPass(new RenderPass(scene, cam));

    this.dof = new DepthOfFieldEffect(cam, { focusDistance: 260, focusRange: 8, bokehScale: 2.2, resolutionScale: 0.5 });
    this.dof.target = scope.target;

    const bloom = new BloomEffect({ intensity: 0.55, luminanceThreshold: 0.72, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.6 });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    const vignette = new VignetteEffect({ offset: 0.28, darkness: 0.72 });
    const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: true });
    grain.blendMode.opacity.value = 0.12;

    this.outline = new OutlineEffect(scene, cam, {
      blendFunction: BlendFunction.SCREEN, edgeStrength: 2.2, visibleEdgeColor: 0x5fe0b8, hiddenEdgeColor: 0x000000,
      xRay: false, blur: true, kernelSize: KernelSize.VERY_SMALL, resolutionScale: low ? 0.5 : 1,
    });

    this.composer.addPass(new EffectPass(cam, this.dof));
    this.composer.addPass(new EffectPass(cam, bloom, tone, this.outline, vignette, grain));
  }

  update(scope: MicroscopeCamera): void {
    // Microscope depth of field ≈ proportional to field diameter (lower mag → deeper focus).
    this.dof.cocMaterial.focusRange = THREE.MathUtils.clamp(scope.fieldDiameter * 0.28, 2.5, 14);
    this.dof.bokehScale = THREE.MathUtils.clamp(36 / scope.fieldDiameter, 1.2, 3.2);
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }
}
