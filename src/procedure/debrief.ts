/**
 * ============================================================================
 *  DEBRIEF — turns the session record into graded items and teaching points.
 * ============================================================================
 *
 * The score is a teaching aid, not an assessment: it starts at 100 and loses
 * points for outcomes and habits a mentor would comment on. Each deduction
 * comes with a short teaching point (i18n key `debrief.pt.<id>`).
 */

export type Grade = 'good' | 'fair' | 'poor';

export interface DebriefInput {
  complete: boolean;
  /** Seconds spent in each stage. */
  stageTimes: number[];
  totalTime: number;
  ebl: number;
  ruptured: boolean;
  /** Seconds from rupture to a proximal temporary clip, null if none. */
  timeToProximal: number | null;
  occlusion: { total: number; max: number; safe: number; warn: number };
  minMep: number;
  clip: {
    applied: boolean;
    closure: number;
    residual: number;
    narrowing: number;
    pcom: number;
    acha: number;
    nerve: boolean;
    repositions: number;
  };
  checks: { icg: boolean; pcom: boolean; acha: boolean };
  technique: { domeStress: number; roughDissection: number; unsafeActions: number; retractionOverload: number };
}

export interface DebriefItem {
  /** i18n key `debrief.item.<id>` for the label. */
  id: string;
  /** Formatted value (numbers and units only, language-neutral) or an i18n key prefixed with "@". */
  value: string;
  grade: Grade;
}

export interface DebriefSection {
  id: 'outcome' | 'safety' | 'technique';
  items: DebriefItem[];
}

export interface DebriefReport {
  score: number;
  grade: Grade;
  sections: DebriefSection[];
  /** Teaching point ids, most important first. */
  points: string[];
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function buildDebrief(d: DebriefInput): DebriefReport {
  let score = 100;
  const points: { id: string; weight: number }[] = [];
  const deduct = (n: number, point: string) => {
    score -= n;
    points.push({ id: point, weight: n });
  };

  // ---------------------------------------------------------------- outcome --
  const c = d.clip;
  const outcome: DebriefItem[] = [];
  if (!c.applied) {
    deduct(40, 'noClip');
    outcome.push({ id: 'clip', value: '@debrief.val.none', grade: 'poor' });
  } else {
    const closureGrade: Grade = c.closure >= 0.95 ? 'good' : c.closure >= 0.8 ? 'fair' : 'poor';
    if (closureGrade !== 'good') deduct(c.closure >= 0.8 ? 15 : 25, 'incomplete');
    outcome.push({ id: 'closure', value: pct(c.closure), grade: closureGrade });

    const residualGrade: Grade = c.residual <= 1.5 ? 'good' : c.residual <= 2.5 ? 'fair' : 'poor';
    if (residualGrade !== 'good') deduct(residualGrade === 'fair' ? 5 : 10, 'residual');
    outcome.push({ id: 'residual', value: `${Math.max(0, c.residual).toFixed(1)} mm`, grade: residualGrade });

    const narrowGrade: Grade = c.narrowing < 0.1 ? 'good' : c.narrowing < 0.25 ? 'fair' : 'poor';
    if (narrowGrade === 'poor') deduct(20, 'parent');
    else if (narrowGrade === 'fair') deduct(5, 'parent');
    outcome.push({ id: 'narrowing', value: pct(c.narrowing), grade: narrowGrade });

    const branch = (v: number): Grade => (v <= 0 ? 'good' : v < 1 ? 'fair' : 'poor');
    if (c.pcom > 0) deduct(c.pcom >= 1 ? 20 : 8, 'pcom');
    if (c.acha > 0) deduct(c.acha >= 1 ? 30 : 12, 'acha');
    outcome.push({ id: 'pcom', value: c.pcom >= 1 ? '@debrief.val.occluded' : c.pcom > 0 ? '@debrief.val.kinked' : '@debrief.val.patent', grade: branch(c.pcom) });
    outcome.push({ id: 'acha', value: c.acha >= 1 ? '@debrief.val.occluded' : c.acha > 0 ? '@debrief.val.kinked' : '@debrief.val.patent', grade: branch(c.acha) });
    if (c.nerve) {
      deduct(5, 'nerve');
      outcome.push({ id: 'nerve', value: '@debrief.val.contact', grade: 'fair' });
    }
  }
  const checksDone = [d.checks.icg, d.checks.pcom, d.checks.acha].filter(Boolean).length;
  if (c.applied) {
    if (!d.checks.icg) deduct(5, 'checkIcg');
    if (!d.checks.pcom || !d.checks.acha) deduct(5, 'checkBranches');
  }
  outcome.push({ id: 'checks', value: `${checksDone}/3`, grade: checksDone === 3 ? 'good' : checksDone >= 1 ? 'fair' : 'poor' });

  // ----------------------------------------------------------------- safety --
  const safety: DebriefItem[] = [];
  if (d.ruptured) {
    deduct(15, 'rupture');
    safety.push({ id: 'rupture', value: '@debrief.val.yes', grade: 'poor' });
    const tp = d.timeToProximal;
    const tGrade: Grade = tp === null ? 'poor' : tp <= 60 ? 'good' : 'fair';
    if (tGrade !== 'good') deduct(5, 'proximal');
    safety.push({ id: 'proximal', value: tp === null ? '—' : mmss(tp), grade: tGrade });
  } else {
    safety.push({ id: 'rupture', value: '@debrief.val.no', grade: 'good' });
  }
  const eblGrade: Grade = d.ebl <= 100 ? 'good' : d.ebl <= 300 ? 'fair' : 'poor';
  if (eblGrade === 'fair') deduct(5, 'blood');
  if (eblGrade === 'poor') deduct(10, 'blood');
  safety.push({ id: 'ebl', value: `${Math.round(d.ebl)} mL`, grade: eblGrade });

  const o = d.occlusion;
  const occGrade: Grade = o.max === 0 || o.max <= o.warn ? 'good' : o.max <= o.safe ? 'fair' : 'poor';
  if (occGrade === 'fair') deduct(5, 'occlusion');
  if (occGrade === 'poor') deduct(15, 'occlusion');
  safety.push({ id: 'occlusion', value: o.total > 0 ? `${mmss(o.max)} (Σ ${mmss(o.total)})` : '—', grade: occGrade });

  const mepGrade: Grade = d.minMep >= 80 ? 'good' : d.minMep >= 50 ? 'fair' : 'poor';
  if (mepGrade === 'poor') deduct(15, 'mep');
  safety.push({ id: 'mep', value: `${Math.round(d.minMep)}%`, grade: mepGrade });

  // -------------------------------------------------------------- technique --
  const t = d.technique;
  const technique: DebriefItem[] = [];
  const domeGrade: Grade = t.domeStress < 15 ? 'good' : t.domeStress < 60 ? 'fair' : 'poor';
  if (domeGrade === 'fair') deduct(5, 'dome');
  if (domeGrade === 'poor') deduct(10, 'dome');
  technique.push({ id: 'dome', value: t.domeStress.toFixed(0), grade: domeGrade });

  const roughGrade: Grade = t.roughDissection < 1 ? 'good' : t.roughDissection < 4 ? 'fair' : 'poor';
  if (roughGrade !== 'good') deduct(5, 'rough');
  technique.push({ id: 'rough', value: `${t.roughDissection.toFixed(1)} s`, grade: roughGrade });

  const unsafeGrade: Grade = t.unsafeActions === 0 ? 'good' : t.unsafeActions <= 2 ? 'fair' : 'poor';
  if (t.unsafeActions > 0) deduct(Math.min(15, 3 * t.unsafeActions), 'unsafe');
  technique.push({ id: 'unsafe', value: String(t.unsafeActions), grade: unsafeGrade });

  const retrGrade: Grade = t.retractionOverload < 0.1 ? 'good' : t.retractionOverload < 0.5 ? 'fair' : 'poor';
  if (retrGrade !== 'good') deduct(5, 'retraction');
  technique.push({ id: 'retraction', value: retrGrade === 'good' ? '@debrief.val.gentle' : '@debrief.val.forced', grade: retrGrade });

  const repGrade: Grade = c.repositions <= 2 ? 'good' : c.repositions <= 4 ? 'fair' : 'poor';
  if (repGrade !== 'good') deduct(3, 'repositions');
  technique.push({ id: 'repositions', value: String(c.repositions), grade: repGrade });
  technique.push({ id: 'time', value: mmss(d.totalTime), grade: 'good' });

  score = Math.max(0, Math.min(100, Math.round(score)));
  const order = points.sort((a, b) => b.weight - a.weight).map((p) => p.id);
  if (!order.length) order.push('excellent');
  return {
    score,
    grade: score >= 85 ? 'good' : score >= 65 ? 'fair' : 'poor',
    sections: [
      { id: 'outcome', items: outcome },
      { id: 'safety', items: safety },
      { id: 'technique', items: technique },
    ],
    points: [...new Set(order)],
  };
}
