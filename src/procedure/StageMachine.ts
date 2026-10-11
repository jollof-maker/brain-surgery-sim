import { EventBus } from '../core/EventBus';
import { STAGES, type ProcedureView, type StageDef } from './stages';

export type StageStatus = 'locked' | 'active' | 'done';

export interface StageEvents extends Record<string, unknown> {
  taskDone: { stage: number; task: string };
  stageCompleted: { stage: number };
  stageActivated: { stage: number };
  procedureComplete: Record<string, never>;
}

/**
 * Tracks which stage is active and which sub-tasks are done.
 * A stage unlocks only when every task of the previous stage is done.
 * Tasks are evaluated against the live simulation; once satisfied while their
 * stage is active they stay done (e.g. a temporarily bleeding field later does
 * not un-check "open the fissure").
 */
export class StageMachine {
  readonly bus = new EventBus<StageEvents>();
  current = 0;
  readonly done: Set<string>[] = STAGES.map(() => new Set());
  complete = false;
  /** Seconds spent in each stage (for the debrief). */
  readonly stageTime = STAGES.map(() => 0);

  constructor(private readonly view: ProcedureView, readonly stages: StageDef[] = STAGES) {}

  status(i: number): StageStatus {
    if (i < this.current || (this.complete && i === this.current)) return 'done';
    return i === this.current ? 'active' : 'locked';
  }

  taskDone(stage: number, task: string): boolean {
    return this.done[stage].has(task);
  }

  /** Progress of a stage, 0..1. */
  stageProgress(i: number): number {
    return this.done[i].size / this.stages[i].tasks.length;
  }

  /** Whole-procedure progress, 0..1. */
  overallProgress(): number {
    const n = this.stages.length;
    if (this.complete) return 1;
    return (this.current + this.stageProgress(this.current)) / n;
  }

  /** First not-yet-done task of the active stage (the mentor's "next" hint). */
  nextTask(): string | null {
    if (this.complete) return null;
    return this.stages[this.current].tasks.find((t) => !this.done[this.current].has(t.id))?.id ?? null;
  }

  update(dt: number): void {
    if (this.complete) return;
    this.stageTime[this.current] += dt;
    // Loop so several stages can complete in one update (e.g. tasks done early).
    for (;;) {
      const i = this.current;
      const stage = this.stages[i];
      for (const t of stage.tasks) {
        if (!this.done[i].has(t.id) && t.check(this.view)) {
          this.done[i].add(t.id);
          this.bus.emit('taskDone', { stage: i, task: t.id });
        }
      }
      if (this.done[i].size < stage.tasks.length) return;
      this.bus.emit('stageCompleted', { stage: i });
      if (i === this.stages.length - 1) {
        this.complete = true;
        this.bus.emit('procedureComplete', {});
        return;
      }
      this.current++;
      this.bus.emit('stageActivated', { stage: this.current });
    }
  }
}
