import type { AudioEngine } from '../audio/AudioEngine';
import { arterialPulse, ecgWave } from '../core/pulse';
import type { SimState } from '../core/SimState';
import type { Patient } from '../physics/Patient';
import { PHYSIO } from '../physics/physiology';
import type { AlarmId } from '../physics/vitals';
import { mmss } from '../tools/tempClip';
import { t } from './i18n';

/** Seconds of trace shown across the waveform canvas (a classic sweep monitor). */
const SWEEP_SEC = 5;
const DANGER: AlarmId[] = ['hrHigh', 'hrLow', 'bpLow', 'mepDrop', 'occlusionLong'];

/**
 * Top-right anesthesia / neuromonitoring panel: sweeping ECG and arterial
 * line, HR, BP, SpO₂, estimated blood loss, MEP amplitude, operating time and
 * the temporary-occlusion timer. Alarms color the values and sound a tone.
 */
export class VitalsPanel {
  private readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private x = 0;
  private lastPhase = 0;
  private lastEcgY = 0;
  private lastArtY = 0;
  private numTimer = 0;
  private alarmTimer = 0;
  private visible = false;

  constructor(
    private readonly state: SimState,
    private readonly patient: Patient,
    private readonly audio: AudioEngine,
  ) {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="vitals" class="panel">
        <div class="panel-head">
          <span data-v="title"></span>
          <span><span class="num" id="v-time"></span>
            <button class="icon-btn" id="v-sound">♪</button></span>
        </div>
        <div class="v-top">
          <canvas id="v-wave"></canvas>
          <div class="v-big">
            <div class="v-hr"><span class="lab">HR</span><span class="num val" id="v-hr"></span></div>
            <div class="v-art"><span class="lab">ART</span><span class="num val" id="v-bp"></span><span class="num sub" id="v-map"></span></div>
          </div>
        </div>
        <div class="v-grid">
          <div class="cell"><span class="lab">SpO₂</span><span class="num val" id="v-spo2"></span></div>
          <div class="cell"><span class="lab" data-v="ebl"></span><span class="num val" id="v-ebl"></span></div>
          <div class="cell"><span class="lab">MEP</span><span class="num val" id="v-mep"></span><div class="mini-bar"><div id="v-mep-bar"></div></div></div>
        </div>
        <div class="v-occ" id="v-occ">
          <span class="lab" data-v="occ"></span><span class="num val" id="v-occ-now"></span>
          <span class="lab" data-v="occTotal"></span><span class="num" id="v-occ-total"></span>
        </div>
        <div class="v-alarm" id="v-alarm"></div>
      </div>`);
    this.el = document.getElementById('vitals')!;
    this.canvas = document.getElementById('v-wave') as HTMLCanvasElement;
    this.g = this.canvas.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = 176 * dpr;
    this.canvas.height = 84 * dpr;
    this.g.scale(dpr, dpr);
    this.g.fillStyle = '#05090a';
    this.g.fillRect(0, 0, 176, 84);

    const sound = document.getElementById('v-sound')!;
    sound.addEventListener('click', () => {
      audio.monitorOn = !audio.monitorOn;
      sound.classList.toggle('off', !audio.monitorOn);
    });
    state.bus.on('beat', () => { if (this.visible) audio.beep(patient.vitals.spo2); });
    state.bus.on('alarmsChanged', ({ fresh }) => {
      if (!this.visible || !fresh.length) return;
      audio.alarm(fresh.some((a) => DANGER.includes(a as AlarmId)) ? 'danger' : 'warn');
      this.alarmTimer = 0;
    });
    state.bus.on('langChanged', () => this.labels());
    this.labels();
  }

  private labels(): void {
    for (const el of this.el.querySelectorAll<HTMLElement>('[data-v]')) el.textContent = t(`vitals.${el.dataset.v}`);
    document.getElementById('v-sound')!.title = t('vitals.sound');
    this.numbers();
  }

  show(on: boolean): void {
    this.visible = on;
    this.el.style.visibility = on ? 'visible' : 'hidden';
  }

  update(dt: number): void {
    if (!this.visible) return;
    this.sweep(dt);
    this.numTimer += dt;
    if (this.numTimer > 0.25) {
      this.numTimer = 0;
      this.numbers();
    }
    // Ongoing danger alarms repeat, like a real monitor, until resolved.
    this.alarmTimer += dt;
    if (this.alarmTimer > 6 && this.patient.alarms.some((a) => DANGER.includes(a))) {
      this.alarmTimer = 0;
      this.audio.alarm('danger');
    }
  }

  /** Draws the newest slice of the ECG and arterial traces with an erase gap ahead of the cursor. */
  private sweep(dt: number): void {
    const W = 176, g = this.g, v = this.patient.vitals;
    const phase = this.state.cardiacPhase;
    const dPhase = (phase - this.lastPhase + 1) % 1;
    const advance = Math.min(W / 2, (dt / SWEEP_SEC) * W);
    const x0 = this.x, x1 = this.x + advance;
    const ecgY = (val: number) => 34 - val * 26;
    const artY = (p: number) => 82 - ((p - 40) / 120) * 32;

    g.fillStyle = '#05090a';
    g.fillRect(Math.floor(x0) + 1, 0, Math.ceil(advance) + 10, 84);
    if (x1 > W) g.fillRect(0, 0, (x1 - W) + 10, 84);

    g.lineWidth = 1.4;
    const cols = Math.max(1, Math.ceil(advance));
    const ecg: [number, number][] = [], art: [number, number][] = [];
    for (let i = 1; i <= cols; i++) {
      const f = i / cols;
      // Sample a few points per column and keep the extreme one, so narrow QRS spikes are never missed.
      let best = 0;
      for (let k = 0; k < 4; k++) {
        const e = ecgWave(this.lastPhase + dPhase * (f - (k / 4) / cols));
        if (Math.abs(e) > Math.abs(best)) best = e;
      }
      const ph = this.lastPhase + dPhase * f;
      const p = v.dia + (v.sys - v.dia) * arterialPulse(ph);
      ecg.push([x0 + advance * f, ecgY(best) + (Math.random() - 0.5) * 0.6]);
      art.push([x0 + advance * f, artY(p)]);
    }
    this.trace('#4dff9a', this.lastEcgY, x0, ecg, W);
    this.trace('#ff6a6a', this.lastArtY, x0, art, W);
    this.lastEcgY = ecg[ecg.length - 1][1];
    this.lastArtY = art[art.length - 1][1];
    this.x = x1 % W;
    this.lastPhase = phase;
  }

  private trace(color: string, fromY: number, fromX: number, pts: [number, number][], W: number): void {
    const g = this.g;
    g.strokeStyle = color;
    g.beginPath();
    g.moveTo(fromX, fromY);
    for (const [x, y] of pts) {
      if (x >= W && fromX < W) {
        g.stroke();
        g.beginPath();
        g.moveTo(x - W, y);
        fromX = W;
      } else {
        g.lineTo(x >= W ? x - W : x, y);
      }
    }
    g.stroke();
  }

  private numbers(): void {
    const v = this.patient.vitals, a = this.patient.alarms;
    const set = (id: string, text: string, alarm = false, warn = false) => {
      const el = document.getElementById(id)!;
      el.textContent = text;
      el.classList.toggle('alarm', alarm);
      el.classList.toggle('warn', warn && !alarm);
    };
    set('v-hr', Math.round(v.hr).toString(), a.includes('hrHigh') || a.includes('hrLow'));
    set('v-bp', `${Math.round(v.sys)}/${Math.round(v.dia)}`, a.includes('bpLow'));
    set('v-map', `(${Math.round(v.map)})`);
    set('v-spo2', `${Math.round(v.spo2)}`, v.spo2 < 92);
    const ebl = this.patient.bleeding.totalLoss;
    set('v-ebl', `${Math.round(ebl)} mL`, ebl > 500, ebl > 150);
    set('v-mep', `${Math.round(v.mep)}%`, a.includes('mepDrop'), v.mep < 80);
    const bar = document.getElementById('v-mep-bar')!;
    bar.style.width = `${v.mep}%`;
    bar.className = a.includes('mepDrop') ? 'alarm' : v.mep < 80 ? 'warn' : '';
    document.getElementById('v-time')!.textContent = mmss(this.patient.elapsed);
    const occ = document.getElementById('v-occ')!;
    occ.classList.toggle('on', v.occlusionSec > 0);
    set('v-occ-now', v.occlusionSec > 0 ? mmss(v.occlusionSec) : '—', a.includes('occlusionLong'), a.includes('occlusionWarn'));
    document.getElementById('v-occ-total')!.textContent = mmss(v.totalOcclusionSec);
    const alarmEl = document.getElementById('v-alarm')!;
    alarmEl.textContent = a.map((id) => t(`alarm.${id}`, { safe: mmss(v.safeOcclusionSec()), limit: PHYSIO.mep.alarmBelow })).join(' · ');
    alarmEl.classList.toggle('on', a.length > 0);
  }
}
