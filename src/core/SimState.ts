import { EventBus } from './EventBus';
import { advancePhase, arterialPulse } from './pulse';

export type Lang = 'en' | 'ja';

export interface SimEvents extends Record<string, unknown> {
  langChanged: Lang;
  beat: { time: number };
}

/**
 * Single in-memory store for the simulation. Later milestones add vitals,
 * bleeding, stage progress, etc. Modules read from it and emit through `bus`.
 */
export class SimState {
  readonly bus = new EventBus<SimEvents>();
  lang: Lang = 'en';
  time = 0;
  heartRate = 72;
  cardiacPhase = 0;
  /** Current arterial pulse value 0..1 — drives vessel/aneurysm pulsation. */
  pulse = 0;

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
}
