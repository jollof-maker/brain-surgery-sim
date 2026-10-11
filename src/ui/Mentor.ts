import type { SimState } from '../core/SimState';
import type { StageMachine } from '../procedure/StageMachine';
import { t } from './i18n';

/**
 * Bottom-right mentor: short, calm guidance for the active stage, its
 * sub-task checkboxes (ticked automatically), stage progress, and a hint for
 * the next task. Collapsible to a single line.
 */
export class Mentor {
  private readonly el: HTMLElement;
  private collapsed = false;

  constructor(state: SimState, private readonly machine: StageMachine) {
    document.body.insertAdjacentHTML('beforeend', '<div id="mentor" class="panel"></div>');
    this.el = document.getElementById('mentor')!;
    this.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-collapse]')) {
        this.collapsed = !this.collapsed;
        this.render();
      }
    });
    machine.bus.on('taskDone', () => this.render());
    machine.bus.on('stageActivated', () => this.render());
    machine.bus.on('procedureComplete', () => this.render());
    state.bus.on('langChanged', () => this.render());
    this.render();
  }

  render(): void {
    const m = this.machine;
    const i = m.current;
    const stage = m.stages[i];
    const pct = Math.round(m.stageProgress(i) * 100);
    const head = `
      <div class="panel-head">
        <span>${t('mentor.title')} · <span class="num">${t('stage.n', { n: i + 1 })}</span></span>
        <span><span class="num">${pct}%</span>
          <button class="icon-btn" data-collapse title="${t('mentor.collapse')}">${this.collapsed ? '+' : '–'}</button></span>
      </div>`;
    if (this.collapsed) {
      this.el.innerHTML = `${head}<div class="mentor-title">${t(`stage.${stage.id}`)}</div>`;
      return;
    }
    if (m.complete) {
      this.el.innerHTML = `${head}<p class="guide">${t('mentor.allDone')}</p>`;
      return;
    }
    const tasks = stage.tasks.map((task) => {
      const done = m.taskDone(i, task.id);
      return `<li class="${done ? 'done' : ''}"><span class="box">${done ? '✓' : ''}</span>${t(`task.${task.id}`)}</li>`;
    }).join('');
    const next = m.nextTask();
    this.el.innerHTML = `${head}
      <div class="mentor-title">${t(`stage.${stage.id}`)}</div>
      <p class="guide">${t(`guide.${stage.id}`)}</p>
      <ul class="tasks">${tasks}</ul>
      ${next ? `<div class="next"><span class="label">${t('mentor.next')}</span> ${t(`hint.${next}`)}</div>` : ''}
      <div class="bar"><div style="width:${pct}%"></div></div>`;
  }

  show(on: boolean): void {
    this.el.style.visibility = on ? 'visible' : 'hidden';
  }
}
