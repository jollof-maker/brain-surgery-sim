import type { SimState } from '../core/SimState';
import { CRISIS_STEPS, type Crisis } from '../procedure/crisis';
import type { StageMachine } from '../procedure/StageMachine';
import { t } from './i18n';

/**
 * Bottom-right mentor: short, calm guidance for the active stage, its
 * sub-task checkboxes (ticked automatically), stage progress, and a hint for
 * the next task. Collapsible to a single line. After a rupture, a red
 * protocol box with the bleeding-control steps sits on top.
 */
export class Mentor {
  private readonly el: HTMLElement;
  private collapsed = false;
  private crisisSig = '';

  constructor(state: SimState, private readonly machine: StageMachine, private readonly crisis: Crisis) {
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
    state.bus.on('ruptured', () => { this.collapsed = false; });
    this.render();
  }

  /** Re-renders when the crisis protocol advances. */
  update(): void {
    const sig = this.crisis.signature();
    if (sig !== this.crisisSig) {
      this.crisisSig = sig;
      this.render();
    }
  }

  private crisisBox(): string {
    const c = this.crisis;
    if (!c.started) return '';
    if (!c.active) return `<div class="crisis resolved">${t('crisis.resolved')}</div>`;
    const steps = CRISIS_STEPS.map((id) => {
      const done = c.done.has(id);
      return `<li class="${done ? 'done' : ''}"><span class="box">${done ? '✓' : ''}</span>${t(`crisis.${id}`)}</li>`;
    }).join('');
    const next = c.next();
    return `<div class="crisis">
      <div class="crisis-title">${t('crisis.title')}</div>
      <p class="guide">${t('crisis.guide')}</p>
      <ul class="tasks">${steps}</ul>
      ${next ? `<div class="next"><span class="label">${t('mentor.next')}</span> ${t(`crisis.hint.${next}`)}</div>` : ''}
    </div>`;
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
      const title = this.crisis.active ? `<span class="crisis-inline">${t('crisis.title')}</span>` : t(`stage.${stage.id}`);
      this.el.innerHTML = `${head}<div class="mentor-title">${title}</div>`;
      return;
    }
    if (m.complete) {
      this.el.innerHTML = `${head}${this.crisisBox()}<p class="guide">${t('mentor.allDone')}</p>`;
      return;
    }
    const tasks = stage.tasks.map((task) => {
      const done = m.taskDone(i, task.id);
      return `<li class="${done ? 'done' : ''}"><span class="box">${done ? '✓' : ''}</span>${t(`task.${task.id}`)}</li>`;
    }).join('');
    const next = m.nextTask();
    this.el.innerHTML = `${head}${this.crisisBox()}
      <div class="mentor-title">${t(`stage.${stage.id}`)}</div>
      ${this.crisis.active ? '' : `<p class="guide">${t(`guide.${stage.id}`)}</p>`}
      <ul class="tasks">${tasks}</ul>
      ${next && !this.crisis.active ? `<div class="next"><span class="label">${t('mentor.next')}</span> ${t(`hint.${next}`)}</div>` : ''}
      <div class="bar"><div style="width:${pct}%"></div></div>`;
  }

  show(on: boolean): void {
    this.el.style.visibility = on ? 'visible' : 'hidden';
  }
}
