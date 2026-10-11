import { TOOL_ORDER, type SimState, type ToolId } from '../core/SimState';
import { clipPose } from '../tools/clip';
import { applyI18n, t } from './i18n';

/** Simple line icons (24×24, stroke = currentColor). */
const ICONS: Record<ToolId, string> = {
  suction: '<path d="M4 21 L15 8 Q17 6 19 5"/><circle cx="19.5" cy="4.5" r="1.5"/>',
  scissors: '<path d="M4 20 L18 5"/><path d="M8 20 L17 4"/><circle cx="12" cy="12.5" r="1.2"/>',
  bipolar: '<path d="M6 21 L11 4"/><path d="M14 21 L12.6 4"/><path d="M5 15 h10" stroke-dasharray="2 2"/>',
  dissector: '<path d="M5 21 L16 7 L17 4"/><circle cx="17.3" cy="3.6" r="1.4"/>',
  spatula: '<rect x="9" y="2.5" width="6" height="13" rx="3"/><path d="M12 15.5 V21.5"/>',
  clip: '<path d="M8 3 L11 15 M16 3 L13 15"/><circle cx="12" cy="17.5" r="2.5"/><path d="M12 20 V22"/>',
  icg: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  doppler: '<path d="M4 21 L12 11"/><circle cx="13" cy="10" r="1.4"/><path d="M16 7 q2 3 0 6M18.5 5 q3.5 5 0 10"/>',
  endoscope: '<path d="M3 21 L15 9"/><path d="M14 6 L18 10 L15 13 L11 9 Z"/><path d="M19 4 l1.5 -1.5"/>',
  tempClip: '<path d="M9 4 L11 14 M15 4 L13 14"/><circle cx="12" cy="16.5" r="2.2"/><path d="M7 21 h10"/>',
};

/**
 * Bottom toolbar: 10 instruments with number-key shortcuts (1–9, 0),
 * the clip variant switch, and a one-line usage tip for the active tool.
 */
export class Toolbar {
  private readonly el: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly variants: HTMLElement;

  constructor(private readonly state: SimState) {
    const buttons = TOOL_ORDER.map((id, i) => `
      <button class="tool" data-tool="${id}" data-i18n-title="tip.${id}">
        <span class="key num">${(i + 1) % 10}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${ICONS[id]}</svg>
        <span class="name" data-i18n="tool.${id}"></span>
      </button>`).join('');
    document.body.insertAdjacentHTML('beforeend', `
      <div id="tool-tip" class="panel"></div>
      <div id="clip-variants" class="panel">
        <button class="btn" data-variant="straight" data-i18n="tool.clip.straight"></button>
        <button class="btn" data-variant="curved" data-i18n="tool.clip.curved"></button>
        <span id="clip-pose" class="num"></span>
      </div>
      <div id="toolbar" class="panel">${buttons}</div>
    `);
    this.el = document.getElementById('toolbar')!;
    this.tip = document.getElementById('tool-tip')!;
    this.variants = document.getElementById('clip-variants')!;

    this.el.querySelectorAll<HTMLButtonElement>('.tool').forEach((b) => {
      b.addEventListener('click', () => state.setTool(b.dataset.tool as ToolId));
    });
    this.variants.querySelectorAll<HTMLButtonElement>('[data-variant]').forEach((b) => {
      b.addEventListener('click', () => state.setClipVariant(b.dataset.variant as 'straight' | 'curved'));
    });
    window.addEventListener('keydown', (e) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!/^[0-9]$/.test(e.key)) return;
      const idx = e.key === '0' ? 9 : Number(e.key) - 1;
      state.setTool(TOOL_ORDER[idx]);
    });
    state.bus.on('toolChanged', () => this.render());
    state.bus.on('clipVariantChanged', () => this.render());
    state.bus.on('langChanged', () => this.render());
    state.bus.on('clipPoseChanged', () => this.render());
    applyI18n(document.body);
    this.render();
  }

  private render(): void {
    this.el.querySelectorAll<HTMLElement>('.tool').forEach((b) => {
      b.classList.toggle('active', b.dataset.tool === this.state.tool);
    });
    const isClip = this.state.tool === 'clip';
    this.variants.style.display = isClip ? 'flex' : 'none';
    this.variants.querySelectorAll<HTMLElement>('[data-variant]').forEach((b) => {
      b.classList.toggle('active', b.dataset.variant === this.state.clipVariant);
    });
    document.getElementById('clip-pose')!.textContent = t('clip.pose', { depth: clipPose.depth.toFixed(1), roll: clipPose.roll });
    this.tip.textContent = `${t(`tool.${this.state.tool}`)} — ${t(`tip.${this.state.tool}`)}`;
  }

  show(on: boolean): void {
    for (const el of [this.el, this.tip]) el.style.visibility = on ? 'visible' : 'hidden';
    if (!on) this.variants.style.display = 'none';
    else this.render();
  }
}
