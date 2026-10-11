import type { SimState, ToastMsg } from '../core/SimState';
import { t } from './i18n';

/**
 * Short event messages above the toolbar. Params that are themselves string
 * keys (e.g. "lobe.frontal") are translated too.
 */
export class Toasts {
  private readonly el: HTMLElement;

  constructor(state: SimState) {
    document.body.insertAdjacentHTML('beforeend', '<div id="toasts"></div>');
    this.el = document.getElementById('toasts')!;
    state.bus.on('toast', (m) => this.show(m));
  }

  private show(m: ToastMsg): void {
    const params: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(m.params ?? {})) params[k] = typeof v === 'string' ? t(v) : v;
    const div = document.createElement('div');
    div.className = `toast ${m.level}`;
    div.textContent = t(m.key, params);
    this.el.appendChild(div);
    while (this.el.children.length > 3) this.el.firstElementChild!.remove();
    setTimeout(() => div.classList.add('out'), 2600);
    setTimeout(() => div.remove(), 3200);
  }
}
