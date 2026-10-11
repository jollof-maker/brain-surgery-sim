import type { SimState } from '../core/SimState';
import { buildDebrief, type DebriefInput, type DebriefReport } from '../procedure/debrief';
import { t } from './i18n';

/**
 * End-of-case debrief: score, graded outcome / safety / technique items and
 * the mentor's teaching points. Opens automatically when the procedure is
 * complete, or any time from the top bar.
 */
export class Debrief {
  private readonly el: HTMLElement;
  private report: DebriefReport | null = null;

  constructor(state: SimState, private readonly collect: () => DebriefInput) {
    document.body.insertAdjacentHTML('beforeend', '<div id="debrief" class="hidden"><div class="card panel"></div></div>');
    this.el = document.getElementById('debrief')!;
    this.el.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (btn?.dataset.act === 'restart') location.reload();
      if (btn?.dataset.act === 'close') this.close();
    });
    state.bus.on('langChanged', () => { if (this.report) this.render(); });
  }

  get isOpen(): boolean {
    return !this.el.classList.contains('hidden');
  }

  open(): void {
    this.report = buildDebrief(this.collect());
    this.render();
    this.el.classList.remove('hidden');
  }

  close(): void {
    this.el.classList.add('hidden');
  }

  private render(): void {
    const r = this.report!;
    const val = (v: string) => (v.startsWith('@') ? t(v.slice(1)) : v);
    const sections = r.sections.map((s) => `
      <section>
        <h3>${t(`debrief.section.${s.id}`)}</h3>
        <ul>${s.items.map((i) => `
          <li><span class="dot ${i.grade}"></span><span class="lab">${t(`debrief.item.${i.id}`)}</span>
            <span class="num v">${val(i.value)}</span></li>`).join('')}
        </ul>
      </section>`).join('');
    const points = r.points.slice(0, 6).map((p) => `<li>${t(`debrief.pt.${p}`)}</li>`).join('');
    this.el.querySelector('.card')!.innerHTML = `
      <div class="head">
        <div>
          <h1>${t('debrief.title')}</h1>
          <p class="sub">${t('debrief.subtitle')}</p>
        </div>
        <div class="score ${r.grade}"><span class="num">${r.score}</span><small>${t(`debrief.grade.${r.grade}`)}</small></div>
      </div>
      <div class="sections">${sections}</div>
      <h3>${t('debrief.points')}</h3>
      <ol class="points">${points}</ol>
      <p class="edu">${t('debrief.disclaimer')}</p>
      <div class="row">
        <button class="btn" data-act="close">${t('debrief.continue')}</button>
        <button class="btn primary" data-act="restart">${t('debrief.restart')}</button>
      </div>`;
  }
}
