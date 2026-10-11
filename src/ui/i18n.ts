import type { Lang } from '../core/SimState';

/** All user-facing strings, English and Japanese. `{name}` placeholders are filled by t(key, params). */
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
  'start.controlsTitle': { en: 'Controls', ja: '操作' },
  'controls.tool': { en: 'Left-click / drag — use instrument · 1–0 select', ja: '左クリック / ドラッグ — 器具を使用 · 1–0 で選択' },
  'controls.tilt': { en: 'Right-drag — tilt microscope', ja: '右ドラッグ — 顕微鏡の傾き' },
  'controls.pan': { en: 'Shift + right-drag / middle-drag — pan', ja: 'Shift + 右ドラッグ / 中ドラッグ — 移動' },
  'controls.zoom': { en: 'Wheel — magnification', ja: 'ホイール — 倍率' },
  'controls.focus': { en: 'F — focus at cursor', ja: 'F — カーソル位置にフォーカス' },
  'controls.reset': { en: 'R — reset view', ja: 'R — 視野リセット' },
  'hud.mag': { en: 'MAG', ja: '倍率' },
  'hud.field': { en: 'FIELD', ja: '視野' },
  'hud.lang': { en: '日本語', ja: 'English' },
  'hud.edu': { en: 'EDUCATIONAL USE ONLY', ja: '教育目的のみ' },

  // ---- tools ----
  'tool.suction': { en: 'Suction', ja: '吸引管' },
  'tool.scissors': { en: 'Micro scissors', ja: 'マイクロ剪刀' },
  'tool.bipolar': { en: 'Bipolar', ja: 'バイポーラ' },
  'tool.dissector': { en: 'Dissector', ja: '剥離子' },
  'tool.spatula': { en: 'Brain spatula', ja: '脳ベラ' },
  'tool.clip': { en: 'Aneurysm clip', ja: '動脈瘤クリップ' },
  'tool.icg': { en: 'ICG angiography', ja: 'ICG蛍光血管撮影' },
  'tool.doppler': { en: 'Micro Doppler', ja: 'マイクロドップラー' },
  'tool.endoscope': { en: 'Endoscope', ja: '内視鏡' },
  'tool.tempClip': { en: 'Temporary clip', ja: '一時遮断クリップ' },
  'tool.clip.straight': { en: 'Straight', ja: 'ストレート' },
  'tool.clip.curved': { en: 'Curved', ja: '弯曲' },

  'tip.suction': { en: 'Hold to aspirate blood and CSF. Keep it off the dome.', ja: '押し続けて血液・髄液を吸引。ドームには当てない。' },
  'tip.scissors': { en: 'Click arachnoid to cut it sharply.', ja: 'くも膜をクリックして鋭的に切離。' },
  'tip.bipolar': { en: 'Hold on a bleeding point to coagulate.', ja: '出血点で押し続けて凝固。' },
  'tip.dissector': { en: 'Drag gently over neck adhesions to free the neck.', ja: '頸部の癒着をゆっくりドラッグして剥離。' },
  'tip.spatula': { en: 'Click a lobe to seat a spatula, drag to retract.', ja: '脳葉をクリックで脳ベラを設置、ドラッグで牽引。' },
  'tip.clip': { en: 'Clip application arrives in milestone M5. Press 6 again to switch straight/curved.', ja: 'クリップ操作はM5で実装予定。6を再度押すとストレート/弯曲を切替。' },
  'tip.icg': { en: 'Fluorescence view arrives in milestone M5.', ja: '蛍光表示はM5で実装予定。' },
  'tip.doppler': { en: 'Doppler flow sounds arrive in milestone M5.', ja: 'ドップラー音はM5で実装予定。' },
  'tip.endoscope': { en: 'Endoscope view arrives in milestone M5.', ja: '内視鏡ビューはM5で実装予定。' },
  'tip.tempClip': { en: 'Temporary occlusion arrives in milestone M4.', ja: '一時遮断はM4で実装予定。' },

  // ---- toasts ----
  'msg.arachnoidCut': { en: 'Arachnoid opened ({n}/{total})', ja: 'くも膜切開 ({n}/{total})' },
  'msg.bridgingBleed': { en: 'Small bridging vessel oozing — use bipolar (3)', ja: '架橋小血管から出血 — バイポーラ(3)で止血' },
  'msg.coagulated': { en: 'Bleeding point coagulated', ja: '出血点を凝固しました' },
  'msg.spatulaSeated': { en: 'Spatula seated on the {lobe} lobe', ja: '{lobe}に脳ベラを設置' },
  'msg.tethered': { en: 'Fissure still tethered — open more arachnoid before retracting', ja: 'まだくも膜で繋がっています — 牽引の前にさらに切開を' },
  'msg.useScissorsFirst': { en: 'Arachnoid in the way — cut it with micro scissors (2)', ja: 'くも膜が邪魔です — マイクロ剪刀(2)で切開' },
  'msg.vesselDanger': { en: 'Careful! That is a vessel', ja: '注意！血管です' },
  'msg.domeDanger': { en: 'Careful! Avoid manipulating the dome', ja: '注意！ドームの操作は避ける' },
  'msg.nerveDanger': { en: 'Careful! That is a cranial nerve', ja: '注意！脳神経です' },
  'msg.tooFast': { en: 'Too fast — dissect in small, gentle strokes', ja: '速すぎます — 小さく優しく剥離' },
  'msg.adhesionFreed': { en: '{name} freed', ja: '{name}を剥離' },
  'msg.useDissector': { en: 'Use the dissector (4) around the neck', ja: '頸部周囲は剥離子(4)を使用' },
  'msg.suctionDome': { en: 'Keep suction off the dome', ja: 'ドームから吸引管を離す' },
  'msg.pending': { en: '{tool}: available in a later milestone', ja: '{tool}: 後のマイルストーンで実装' },

  'lobe.frontal': { en: 'frontal', ja: '前頭葉' },
  'lobe.temporal': { en: 'temporal', ja: '側頭葉' },
  'adhesion.neckProximal': { en: 'Proximal neck', ja: '近位頸部' },
  'adhesion.neckDistal': { en: 'Distal neck', ja: '遠位頸部' },
  'adhesion.pcomVeil': { en: 'PCom arachnoid', ja: 'PComのくも膜' },
  'adhesion.domeTether': { en: 'Dome–oculomotor band', ja: 'ドーム–動眼神経間の索' },
} satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof STRINGS;

let current: Lang = 'en';

export function setLang(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang;
  applyI18n(document.body);
}

export function getLang(): Lang {
  return current;
}

export function t(key: string, params?: Record<string, string | number>): string {
  const entry = (STRINGS as Record<string, Record<Lang, string>>)[key];
  let s = entry ? entry[current] : key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
  return s;
}

/** Fills every element carrying data-i18n="key" with the current translation. */
export function applyI18n(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n!);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle!);
  });
}
