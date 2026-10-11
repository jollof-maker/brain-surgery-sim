import type * as THREE from 'three';
import type { Anatomy } from '../anatomy/Anatomy';
import type { AudioEngine } from '../audio/AudioEngine';
import type { SimState, ToastLevel, ToolId } from '../core/SimState';
import type { BleedingSystem } from '../physics/bleeding';
import type { Stage } from '../scene/Stage';

export type HitKind =
  | 'brain' | 'vessel' | 'aneurysm' | 'nerve' | 'arachnoid' | 'adhesion' | 'spatula' | 'floor' | 'blood';

export interface Hit {
  object: THREE.Object3D;
  point: THREE.Vector3;
  /** World-space surface normal. */
  normal: THREE.Vector3;
  kind: HitKind;
  id?: string;
}

/** How a hovered target is highlighted: valid (teal), warn (amber, risky), none. */
export type HoverClass = 'valid' | 'warn' | 'none';

export interface ToolContext {
  state: SimState;
  anatomy: Anatomy;
  bleeding: BleedingSystem;
  audio: AudioEngine;
  stage: Stage;
  /** Throttled toast (same key at most every ~2.5 s). */
  say(key: string, level?: ToastLevel, params?: Record<string, string | number>): void;
  /** Positive identification of a vessel/nerve by gentle touch. */
  identify(id: string): void;
  /** Raycast through the current pointer ignoring some kinds (e.g. what lies under a membrane). */
  pickUnder(exclude: HitKind[]): Hit | null;
}

export interface PointerInfo {
  hit: Hit | null;
  dt: number;
  /** Pointer movement since last frame, CSS px. */
  screenDelta: THREE.Vector2;
  /** Tip movement since last frame in mm (0 when the hit target changed). */
  tipDelta: THREE.Vector3;
}

export interface ToolBehavior {
  id: ToolId;
  /** Which hand holds it — sets where the shaft comes from. Suction is the left-hand tool. */
  hand: 'left' | 'right';
  /** Hit kinds the instrument reaches through (e.g. thin membranes for suction). */
  passThrough: HitKind[];
  /** Jaw state while pressed / released (0 closed .. 1 open); omitted = no jaws. */
  jaw?: { pressed: number; released: number };
  classify(hit: Hit, ctx: ToolContext): HoverClass;
  press?(hit: Hit | null, ctx: ToolContext): void;
  /** Called every frame while the button is held. */
  hold?(p: PointerInfo, ctx: ToolContext): void;
  release?(ctx: ToolContext): void;
}

export function vesselWarn(hit: Hit): HoverClass {
  return hit.kind === 'vessel' || hit.kind === 'aneurysm' || hit.kind === 'nerve' ? 'warn' : 'none';
}
