import type { SimState } from '../core/SimState';
import type { MicroscopeCamera } from '../scene/MicroscopeCamera';
import { applyI18n, setLang } from './i18n';

/**
 * Static UI shell: start screen (with the educational disclaimer), the top
 * bar (magnification, field, language toggle) and the controls hint.
 * Panels for later milestones (checklist, vitals, mentor, toolbar) mount here too.
 */
export class Shell {
  private magEl!: HTMLElement;
  private fieldEl!: HTMLElement;

  constructor(state: SimState, onBegin: () => void) {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="eyepiece"></div>
      <div id="topbar" class="panel">
        <span><span class="label" data-i18n="hud.mag"></span><span class="num" id="hud-mag"></span></span>
        <span><span class="label" data-i18n="hud.field"></span><span class="num" id="hud-field"></span></span>
        <span class="edu" data-i18n="hud.edu"></span>
        <button class="btn" id="lang-toggle" data-i18n="hud.lang"></button>
      </div>
      <div id="controls-hint" class="panel">
        <div data-i18n="controls.tool"></div>
        <div data-i18n="controls.tilt"></div>
        <div data-i18n="controls.pan"></div>
        <div data-i18n="controls.zoom"></div>
        <div data-i18n="controls.focus"></div>
        <div data-i18n="controls.reset"></div>
      </div>
      <div id="start">
        <div class="card panel">
          <div class="row" style="margin-bottom:10px">
            <h1 data-i18n="app.title"></h1>
            <button class="btn" id="start-lang" data-i18n="hud.lang"></button>
          </div>
          <p class="sub" data-i18n="app.subtitle"></p>
          <div class="disclaimer">
            <strong data-i18n="start.disclaimerTitle"></strong>
            <span data-i18n="start.disclaimer"></span>
          </div>
          <h2 data-i18n="start.controlsTitle"></h2>
          <ul>
            <li data-i18n="controls.tool"></li>
            <li data-i18n="controls.tilt"></li>
            <li data-i18n="controls.pan"></li>
            <li data-i18n="controls.zoom"></li>
            <li data-i18n="controls.focus"></li>
            <li data-i18n="controls.reset"></li>
          </ul>
          <div class="row" style="justify-content:flex-end">
            <button class="btn primary" id="begin" data-i18n="start.begin"></button>
          </div>
        </div>
      </div>
    `);
    this.magEl = document.getElementById('hud-mag')!;
    this.fieldEl = document.getElementById('hud-field')!;

    const toggle = () => state.setLang(state.lang === 'en' ? 'ja' : 'en');
    document.getElementById('lang-toggle')!.addEventListener('click', toggle);
    document.getElementById('start-lang')!.addEventListener('click', toggle);
    state.bus.on('langChanged', (lang) => setLang(lang));

    document.getElementById('begin')!.addEventListener('click', () => {
      document.getElementById('start')!.classList.add('hidden');
      onBegin();
    });
    applyI18n(document.body);
  }

  update(scope: MicroscopeCamera): void {
    this.magEl.textContent = `${scope.magnification.toFixed(1)}×`;
    this.fieldEl.textContent = `${scope.fieldDiameter.toFixed(0)} mm`;
  }
}
