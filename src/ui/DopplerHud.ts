import type { SimState } from '../core/SimState';
import { t } from './i18n';

/** Small readout next to the tool tip while the Doppler probe touches something. */
export class DopplerHud {
  private readonly el: HTMLElement;
  private last = '';

  constructor(private readonly state: SimState) {
    document.body.insertAdjacentHTML('beforeend', '<div id="doppler-hud" class="panel"></div>');
    this.el = document.getElementById('doppler-hud')!;
  }

  update(): void {
    const d = this.state.doppler;
    const text = d
      ? `${t('doppler.label')} · ${t(d.target === 'aneurysm' ? 'struct.dome' : `struct.${d.target}`)} — ${t(
        d.flow > 0.6 ? 'doppler.strong' : d.flow > 0.2 ? 'doppler.weak' : 'doppler.none')}`
      : '';
    if (text === this.last) return;
    this.last = text;
    this.el.textContent = text;
    this.el.classList.toggle('on', !!d);
    this.el.classList.toggle('none', !!d && d.flow <= 0.2);
  }
}
