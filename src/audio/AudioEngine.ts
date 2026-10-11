/**
 * Procedural Web Audio sounds. The AudioContext is created on the first user
 * gesture (the Begin button) because browsers block audio before that.
 * M2: instrument sounds. M4/M5 add the ECG beep, alarms and Doppler.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private loops = new Map<string, { stop(): void }>();

  start(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
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
  setLoop(name: 'bipolar' | 'suction', on: boolean): void {
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
    g.gain.setTargetAtTime(name === 'bipolar' ? 0.12 : 0.18, ctx.currentTime, 0.03);
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
    } else {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1200;
      bp.Q.value = 0.7;
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

  stopAll(): void {
    for (const name of [...this.loops.keys()]) this.setLoop(name as 'bipolar' | 'suction', false);
  }
}
