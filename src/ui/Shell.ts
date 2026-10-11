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

  constructor(
    state: SimState,
    on: { begin: () => void; demo: () => void; debrief: () => void; mute: () => boolean },
  ) {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="eyepiece"></div>
      <div id="topbar" class="panel">
        <span><span class="label" data-i18n="hud.mag"></span><span class="num" id="hud-mag"></span></span>
        <span><span class="label" data-i18n="hud.field"></span><span class="num" id="hud-field"></span></span>
        <span class="edu" data-i18n="hud.edu"></span>
        <button class="btn" id="demo-toggle" data-i18n="hud.demo"></button>
        <button class="btn" id="debrief-open" data-i18n="hud.debrief"></button>
        <button class="btn" id="mute-toggle" data-i18n-title="hud.mute">🔊</button>
        <button class="btn" id="help-toggle" data-i18n-title="hud.help">?</button>
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
          <div class="row" style="justify-content:flex-end; gap:10px">
            <button class="btn" id="watch-demo" data-i18n="start.demo"></button>
            <button class="btn primary" id="begin" data-i18n="start.begin"></button>
          </div>
        </div>
      </div>
    `);
    this.magEl = document.getElementById('hud-mag')!;
    this.fieldEl = document.getElementById('hud-field')!;

    const toggle = () => state.setLang(state.lang === 'en' ? 'ja' : 'en');
    document.getElementById('lang-toggle')!.addEventListener('click', toggle);
    document.getElementById('help-toggle')!.addEventListener('click', () => {
      document.getElementById('controls-hint')!.classList.toggle('open');
    });
    document.getElementById('start-lang')!.addEventListener('click', toggle);
    state.bus.on('langChanged', (lang) => setLang(lang));

    const begin = () => {
      document.getElementById('start')!.classList.add('hidden');
      on.begin();
    };
    document.getElementById('begin')!.addEventListener('click', begin);
    document.getElementById('watch-demo')!.addEventListener('click', () => {
      begin();
      on.demo();
    });
    document.getElementById('demo-toggle')!.addEventListener('click', () => on.demo());
    document.getElementById('debrief-open')!.addEventListener('click', () => on.debrief());
    const mute = document.getElementById('mute-toggle')!;
    mute.addEventListener('click', () => {
      mute.textContent = on.mute() ? '🔇' : '🔊';
    });
    applyI18n(document.body);
  }

  update(scope: MicroscopeCamera): void {
    this.magEl.textContent = `${scope.magnification.toFixed(1)}×`;
    this.fieldEl.textContent = `${scope.fieldDiameter.toFixed(0)} mm`;
  }
}
