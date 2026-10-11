import type { SimState } from '../core/SimState';
import type { StageMachine } from '../procedure/StageMachine';
import { t } from './i18n';

/** Left panel: the six stages with done / active / locked status and overall progress. */
export class Checklist {
  private readonly el: HTMLElement;

  constructor(state: SimState, private readonly machine: StageMachine) {
    document.body.insertAdjacentHTML('beforeend', '<div id="checklist" class="panel"></div>');
    this.el = document.getElementById('checklist')!;
    machine.bus.on('taskDone', () => this.render());
    machine.bus.on('stageActivated', () => this.render());
    machine.bus.on('procedureComplete', () => this.render());
    state.bus.on('langChanged', () => this.render());
    this.render();
  }

  render(): void {
    const m = this.machine;
    const pct = Math.round(m.overallProgress() * 100);
    const rows = m.stages.map((s, i) => {
      const st = m.status(i);
      const mark = st === 'done' ? '✓' : st === 'active' ? '▶' : '·';
      const sub = st === 'active' ? `<span class="num stage-pct">${Math.round(m.stageProgress(i) * 100)}%</span>` : '';
      return `<li class="stage ${st}"><span class="mark">${mark}</span><span class="num idx">${i + 1}</span><span class="label">${t(`stage.${s.id}`)}</span>${sub}</li>`;
    }).join('');
    this.el.innerHTML = `
      <div class="panel-head"><span>${t('checklist.title')}</span><span class="num">${pct}%</span></div>
      <ol>${rows}</ol>
      <div class="bar"><div style="width:${pct}%"></div></div>`;
  }

  show(on: boolean): void {
    this.el.style.visibility = on ? 'visible' : 'hidden';
  }
}
