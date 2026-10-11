import { EventBus } from './EventBus';
import { advancePhase, arterialPulse } from './pulse';
import type { ProcedureFlag, StructureId } from '../procedure/stages';

export type Lang = 'en' | 'ja';

export type ToolId =
  | 'suction' | 'scissors' | 'bipolar' | 'dissector' | 'spatula'
  | 'clip' | 'icg' | 'doppler' | 'endoscope' | 'tempClip';

/** Toolbar order; index + 1 is the keyboard shortcut (10th = key 0). */
export const TOOL_ORDER: ToolId[] = [
  'suction', 'scissors', 'bipolar', 'dissector', 'spatula',
  'clip', 'icg', 'doppler', 'endoscope', 'tempClip',
];

export type ClipVariant = 'straight' | 'curved';
export type LobeId = 'frontal' | 'temporal';
export type ToastLevel = 'info' | 'good' | 'warn' | 'danger';

export interface ToastMsg {
  key: string;
  level: ToastLevel;
  params?: Record<string, string | number>;
}

export interface SimEvents extends Record<string, unknown> {
  langChanged: Lang;
  beat: { time: number };
  toolChanged: ToolId;
  clipVariantChanged: ClipVariant;
  toast: ToastMsg;
  arachnoidCut: { band: string; index: number };
  adhesionFreed: { id: string };
  spatulaPlaced: { lobe: LobeId };
  oozeStarted: { id: number };
  oozeStopped: { id: number };
  structureIdentified: { id: StructureId };
}

/**
 * Single in-memory store for the simulation. Modules read from it and
 * communicate through `bus`. Later milestones add vitals, stage progress, etc.
 */
export class SimState {
  readonly bus = new EventBus<SimEvents>();
  lang: Lang = 'en';
  time = 0;
  heartRate = 72;
  cardiacPhase = 0;
  /** Current arterial pulse value 0..1 — drives vessel/aneurysm pulsation. */
  pulse = 0;

  tool: ToolId = 'scissors';
  clipVariant: ClipVariant = 'straight';

  /** Lobe retraction 0 (closed fissure) .. 1 (fully opened), and whether a spatula holds it. */
  retraction: Record<LobeId, { value: number; seated: boolean }> = {
    frontal: { value: 0.15, seated: false },
    temporal: { value: 0.15, seated: false },
  };

  /**
   * Hidden technique metrics (used later for rupture risk and the debrief).
   *  domeStress        — accumulated handling of the aneurysm dome (0..)
   *  roughDissection   — dissector strokes that were too fast
   *  unsafeActions     — e.g. scissors or bipolar on a major vessel
   *  retractionOverload — pulling on the lobes before the arachnoid was opened
   */
  metrics = { domeStress: 0, roughDissection: 0, unsafeActions: 0, retractionOverload: 0 };

  /** Structures positively identified (dissector tap now, Doppler from M5). */
  identified = new Set<StructureId>();
  /** Outcome flags set by clip evaluation / ICG / Doppler (M5). */
  flags = new Set<ProcedureFlag>();

  tick(dt: number): void {
    this.time += dt;
    const prev = this.cardiacPhase;
    this.cardiacPhase = advancePhase(this.cardiacPhase, dt, this.heartRate);
    if (this.cardiacPhase < prev) this.bus.emit('beat', { time: this.time });
    this.pulse = arterialPulse(this.cardiacPhase);
  }

  setLang(lang: Lang): void {
    this.lang = lang;
    this.bus.emit('langChanged', lang);
  }

  setTool(tool: ToolId): void {
    if (tool === 'clip' && this.tool === 'clip') {
      // Pressing the clip key again toggles straight/curved.
      this.setClipVariant(this.clipVariant === 'straight' ? 'curved' : 'straight');
      return;
    }
    this.tool = tool;
    this.bus.emit('toolChanged', tool);
  }

  setClipVariant(v: ClipVariant): void {
    this.clipVariant = v;
    this.bus.emit('clipVariantChanged', v);
  }

  toast(key: string, level: ToastLevel = 'info', params?: ToastMsg['params']): void {
    this.bus.emit('toast', { key, level, params });
  }
}
