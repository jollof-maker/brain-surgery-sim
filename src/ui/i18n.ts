import type { Lang } from '../core/SimState';

/** All user-facing strings, English and Japanese. */
const STRINGS = {
  'app.title': { en: 'IC-PC Aneurysm Clipping Simulator', ja: 'IC-PC動脈瘤クリッピング シミュレーター' },
  'app.subtitle': {
    en: 'Right pterional, transsylvian approach · unruptured 6.6 mm IC-PC aneurysm',
    ja: '右前頭側頭開頭・経シルビウス裂アプローチ · 未破裂 6.6 mm IC-PC動脈瘤',
  },
  'start.disclaimerTitle': { en: 'Educational demonstration only', ja: '教育・デモンストレーション専用' },
  'start.disclaimer': {
    en: 'This simulator is for education and demonstration only. It is NOT a clinical training device, has not been validated, and does not provide medical advice. Anatomy, instruments and physiology are simplified teaching models.',
    ja: '本シミュレーターは教育およびデモンストレーション専用です。臨床トレーニング機器ではなく、妥当性の検証も行っておらず、医学的助言を提供するものではありません。解剖・器具・生理は簡略化した教育用モデルです。',
  },
  'start.begin': { en: 'Begin', ja: '開始' },
  'start.controlsTitle': { en: 'Microscope controls', ja: '顕微鏡の操作' },
  'controls.tilt': { en: 'Right-drag — tilt microscope', ja: '右ドラッグ — 顕微鏡の傾き' },
  'controls.pan': { en: 'Shift + right-drag / middle-drag — pan', ja: 'Shift + 右ドラッグ / 中ドラッグ — 移動' },
  'controls.zoom': { en: 'Wheel — magnification', ja: 'ホイール — 倍率' },
  'controls.focus': { en: 'F — focus at cursor', ja: 'F — カーソル位置にフォーカス' },
  'controls.reset': { en: 'R — reset view', ja: 'R — 視野リセット' },
  'hud.mag': { en: 'MAG', ja: '倍率' },
  'hud.field': { en: 'FIELD', ja: '視野' },
  'hud.lang': { en: '日本語', ja: 'English' },
  'hud.edu': { en: 'EDUCATIONAL USE ONLY', ja: '教育目的のみ' },
} satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof STRINGS;

let current: Lang = 'en';

export function setLang(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang;
  applyI18n(document.body);
}

export function t(key: StringKey): string {
  return STRINGS[key][current];
}

/** Fills every element carrying data-i18n="key" with the current translation. */
export function applyI18n(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n as StringKey;
    if (key in STRINGS) el.textContent = t(key);
  });
}
