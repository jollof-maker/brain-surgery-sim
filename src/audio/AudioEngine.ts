/**
 * Procedural Web Audio sounds. The AudioContext is created on the first user
 * gesture (the Begin button) because browsers block audio before that.
 * Instrument sounds, monitor beep, alarms and the micro-Doppler.
 */
type LoopName = 'bipolar' | 'suction' | 'doppler';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private loops = new Map<string, { stop(): void }>();

  start(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    // Fade in rather than starting abruptly.
    this.master.gain.value = 0;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.3);
    // Browsers suspend audio in background tabs; resume when the tab returns.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.ctx?.resume();
    });
    this.master.connect(this.ctx.destination);
    // 2 s of white noise, reused by every noise-based sound.
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  /** Short crisp click of micro-scissor blades closing. */
  snip(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4000;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(hp).connect(g).connect(this.master);
    src.start(t, Math.random(), 0.06);
  }

  /** Soft two-note chime when a stage is completed. */
  chime(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    [660, 880].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + i * 0.12);
      g.gain.linearRampToValueAtTime(0.18, t + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.6);
      osc.connect(g).connect(this.master);
      osc.start(t + i * 0.12);
      osc.stop(t + i * 0.12 + 0.65);
    });
  }

  /** Continuous sound while an instrument is active (e.g. bipolar buzz, suction hiss). */
  setLoop(name: LoopName, on: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const existing = this.loops.get(name);
    if (!on) {
      existing?.stop();
      this.loops.delete(name);
      return;
    }
    if (existing) return;
    const g = ctx.createGain();
    g.gain.value = 0;
    if (name !== 'doppler') g.gain.setTargetAtTime(name === 'bipolar' ? 0.12 : 0.18, ctx.currentTime, 0.03);
    g.connect(this.master);
    const nodes: AudioScheduledSourceNode[] = [];
    if (name === 'bipolar') {
      // Generator tone: buzzy square wave, band-limited.
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 440;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      osc.connect(lp).connect(g);
      nodes.push(osc);
    } else if (name === 'doppler') {
      // Doppler audio is band-limited noise whose center frequency follows blood velocity.
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 3;
      bp.frequency.value = 300;
      const bp2 = ctx.createBiquadFilter();
      bp2.type = 'bandpass';
      bp2.Q.value = 2;
      src.connect(bp).connect(bp2).connect(g);
      this.dopplerNodes = { bp, bp2, g };
      nodes.push(src);
    } else {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1200;
      bp.Q.value = 0.7;
      this.suctionFilter = bp;
      src.connect(bp).connect(g);
      nodes.push(src);
    }
    nodes.forEach((n) => n.start());
    this.loops.set(name, {
      stop: () => {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
        nodes.forEach((n) => n.stop(ctx.currentTime + 0.2));
      },
    });
  }

  /** Metallic click of a clip closing / being released. */
  clipClick(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2400, t);
    osc.frequency.exponentialRampToValueAtTime(900, t + 0.04);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.1);
    this.snip();
  }

  /** Monitor (pulse oximeter / ECG) sounds on/off. */
  monitorOn = true;

  /**
   * Pulse-oximeter beep, one per heartbeat. Like real monitors, the pitch
   * falls as oxygen saturation falls, so desaturation is audible.
   */
  beep(spo2: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.monitorOn) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 880 - (100 - spo2) * 22;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  /** Three-note "high priority" alarm burst (IEC 60601-style rhythm, simplified). */
  alarm(level: 'warn' | 'danger'): void {
    const ctx = this.ctx;
    if (!ctx || !this.monitorOn) return;
    const t = ctx.currentTime;
    const notes = level === 'danger' ? [988, 784, 988, 784, 988] : [659, 523, 659];
    notes.forEach((f, i) => {
      const at = t + i * (level === 'danger' ? 0.14 : 0.2);
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.07, at + 0.01);
      g.gain.setValueAtTime(0.07, at + 0.09);
      g.gain.linearRampToValueAtTime(0, at + 0.11);
      osc.connect(lp).connect(g).connect(this.master);
      osc.start(at);
      osc.stop(at + 0.12);
    });
  }

  /** Sudden rush of arterial bleeding. */
  rush(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t, 0, 1.3);
  }

  /** Suction sound turns gurgling while it is aspirating blood. */
  setSuctionWet(wet: boolean): void {
    const f = this.suctionFilter;
    if (!f || !this.ctx) return;
    f.frequency.setTargetAtTime(wet ? 450 : 1200, this.ctx.currentTime, 0.05);
    f.Q.setTargetAtTime(wet ? 4 : 0.7, this.ctx.currentTime, 0.05);
  }

  private suctionFilter: BiquadFilterNode | null = null;
  private dopplerNodes: { bp: BiquadFilterNode; bp2: BiquadFilterNode; g: GainNode } | null = null;

  /**
   * Updates the Doppler sound each frame: `flow` 0..1 sets loudness,
   * `velocity` (1 = normal) and the arterial `pulse` 0..1 set the pitch —
   * a whoosh that rises in systole.
   */
  setDoppler(flow: number, velocity: number, pulse: number): void {
    const n = this.dopplerNodes;
    if (!n || !this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 180 + 1500 * velocity * (0.2 + pulse);
    n.bp.frequency.setTargetAtTime(f, t, 0.01);
    n.bp2.frequency.setTargetAtTime(f * 1.4, t, 0.01);
    // A faint probe hiss is always there; flow adds the signal.
    n.g.gain.setTargetAtTime(0.02 + 0.9 * Math.min(1, flow) * (0.25 + pulse), t, 0.01);
  }

  muted = false;

  /** Mutes / unmutes everything (smooth ramp, no clicks). Returns the new state. */
  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  stopAll(): void {
    for (const name of [...this.loops.keys()]) this.setLoop(name as LoopName, false);
  }
}
