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
  'tip.dissector': { en: 'Tap a vessel or nerve to identify it; drag gently over neck adhesions to free the neck.', ja: '血管・神経をタップで同定。頸部の癒着をゆっくりドラッグして剥離。' },
  'tip.spatula': { en: 'Click a lobe to seat a spatula, drag to retract.', ja: '脳葉をクリックで脳ベラを設置、ドラッグで牽引。' },
  'tip.clip': { en: 'Clip application arrives in milestone M5. Press 6 again to switch straight/curved.', ja: 'クリップ操作はM5で実装予定。6を再度押すとストレート/弯曲を切替。' },
  'tip.icg': { en: 'Fluorescence view arrives in milestone M5.', ja: '蛍光表示はM5で実装予定。' },
  'tip.doppler': { en: 'Doppler flow sounds arrive in milestone M5.', ja: 'ドップラー音はM5で実装予定。' },
  'tip.endoscope': { en: 'Endoscope view arrives in milestone M5.', ja: '内視鏡ビューはM5で実装予定。' },

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
  // ---- procedure ----
  'checklist.title': { en: 'PROCEDURE', ja: '手順' },
  'checklist.overall': { en: 'Overall', ja: '全体' },
  'mentor.title': { en: 'MENTOR', ja: '指導医' },
  'mentor.next': { en: 'Next', ja: '次' },
  'mentor.allDone': { en: 'All steps complete. Well done.', ja: '全手順が完了しました。お疲れさまでした。' },
  'mentor.collapse': { en: 'Collapse / expand', ja: '折りたたみ / 展開' },
  'stage.n': { en: 'Stage {n}', ja: 'ステージ {n}' },

  'stage.openFissure': { en: 'Open the sylvian fissure', ja: 'シルビウス裂の開放' },
  'stage.identifyM1': { en: 'Identify M1', ja: 'M1の同定' },
  'stage.identifyICA': { en: 'Identify the ICA and optic nerve', ja: '内頸動脈と視神経の同定' },
  'stage.pcomNeck': { en: 'Confirm the PCom and dissect the neck', ja: 'PComの確認と頸部剥離' },
  'stage.clip': { en: 'Clip the aneurysm', ja: '動脈瘤のクリッピング' },
  'stage.confirmPatency': { en: 'Confirm PCom patency', ja: 'PCom開存の確認' },

  'guide.openFissure': {
    en: 'Open the arachnoid sharply with the micro scissors, working along the fissure. Coagulate any small bleeding, then seat both spatulas gently — let dissection, not retraction, open the fissure.',
    ja: 'マイクロ剪刀でシルビウス裂に沿ってくも膜を鋭的に切開します。小出血はバイポーラで凝固し、その後両側に脳ベラを優しく設置します。牽引ではなく剥離で裂を開きましょう。',
  },
  'guide.identifyM1': {
    en: 'Find M1 deep in the fissure and follow it medially to the carotid bifurcation. Touch each vessel gently with the dissector to confirm it.',
    ja: '裂の深部でM1を見つけ、内側へ辿って内頸動脈分岐部へ。剥離子で各血管に優しく触れて確認します。',
  },
  'guide.identifyICA': {
    en: 'Open the carotid cistern. The ICA runs just lateral to the optic nerve — confirm both before going deeper.',
    ja: '頸動脈槽を開放します。内頸動脈は視神経のすぐ外側を走行します。深部へ進む前に両方を確認しましょう。',
  },
  'guide.pcomNeck': {
    en: 'Tilt the microscope laterally to look around the ICA. Free the PCom from its arachnoid and confirm it and the anterior choroidal artery. Then free the proximal and distal neck with small, slow strokes — stay off the dome.',
    ja: '顕微鏡を外側へ傾け、内頸動脈の裏側を観察します。PComをくも膜から剥離し、PComと前脈絡叢動脈を確認。その後、小さくゆっくりした操作で近位・遠位頸部を剥離します。ドームには触れないこと。',
  },
  'guide.clip': {
    en: 'Choose a clip that matches the neck. Pass the blades across the whole neck, parallel to the ICA, without catching the PCom or AChA. (Clip application arrives in M5.)',
    ja: '頸部に合ったクリップを選択します。PCom・AChAを巻き込まないよう、内頸動脈に平行に頸部全体へブレードを通します。（クリップ操作はM5で実装）',
  },
  'guide.confirmPatency': {
    en: 'Confirm the result: on ICG the dome stays dark while the ICA, PCom and AChA fill; Doppler on the PCom and AChA is still pulsatile. (Arrives in M5.)',
    ja: '結果を確認します。ICGでドームが造影されず、内頸動脈・PCom・AChAが造影されること。PCom・AChAのドップラーで拍動性血流を確認。（M5で実装）',
  },

  'task.cutSylvian': { en: 'Open the sylvian arachnoid (≥ 4 of 6)', ja: 'シルビウス裂のくも膜を開放（6中4以上）' },
  'task.dryField': { en: 'Keep the field dry — no active bleeding', ja: '術野をドライに — 活動性出血なし' },
  'task.spatulas': { en: 'Seat frontal and temporal spatulas', ja: '前頭葉・側頭葉に脳ベラを設置' },
  'task.idM1': { en: 'Identify M1', ja: 'M1を同定' },
  'task.idA1': { en: 'Follow M1 to the bifurcation: identify A1', ja: 'M1を分岐部まで辿りA1を同定' },
  'task.cutCarotid': { en: 'Open the carotid cistern (≥ 3 of 4)', ja: '頸動脈槽を開放（4中3以上）' },
  'task.idICA': { en: 'Identify the ICA', ja: '内頸動脈を同定' },
  'task.idOptic': { en: 'Identify the optic nerve', ja: '視神経を同定' },
  'task.pcomVeil': { en: 'Free the PCom from its arachnoid', ja: 'PComをくも膜から剥離' },
  'task.idPCom': { en: 'Confirm the PCom', ja: 'PComを確認' },
  'task.idAChA': { en: 'Confirm the anterior choroidal artery', ja: '前脈絡叢動脈を確認' },
  'task.neckProximal': { en: 'Free the proximal neck', ja: '近位頸部を剥離' },
  'task.neckDistal': { en: 'Free the distal neck', ja: '遠位頸部を剥離' },
  'task.domeTether': { en: 'Release the dome–oculomotor band', ja: 'ドーム–動眼神経間の索を解除' },
  'task.clipApplied': { en: 'Apply a permanent clip', ja: '永久クリップを留置' },
  'task.neckOccluded': { en: 'Neck completely closed', ja: '頸部の完全閉塞' },
  'task.parentPatent': { en: 'ICA not narrowed', ja: '内頸動脈の狭窄なし' },
  'task.icgDone': { en: 'Run ICG angiography', ja: 'ICG蛍光血管撮影を実施' },
  'task.pcomFlow': { en: 'PCom flow confirmed', ja: 'PComの血流を確認' },
  'task.achaFlow': { en: 'AChA flow confirmed', ja: 'AChAの血流を確認' },

  'hint.cutSylvian': { en: 'Scissors (2): click the milky membrane between the lobes.', ja: '剪刀(2)：脳葉間の白っぽい膜をクリック。' },
  'hint.dryField': { en: 'Bipolar (3): hold on each red bleeding point.', ja: 'バイポーラ(3)：赤い出血点で押し続ける。' },
  'hint.spatulas': { en: 'Spatula (5): click each lobe and drag gently away from the fissure.', ja: '脳ベラ(5)：各脳葉をクリックし、裂から離す方向へ優しくドラッグ。' },
  'hint.idM1': { en: 'Dissector (4): tap the M1 running laterally in the fissure.', ja: '剥離子(4)：裂内を外側へ走るM1を軽くタップ。' },
  'hint.idA1': { en: 'Dissector (4): tap the A1 heading medially from the bifurcation.', ja: '剥離子(4)：分岐部から内側へ向かうA1をタップ。' },
  'hint.cutCarotid': { en: 'Scissors (2): open the membrane over the ICA and optic nerve.', ja: '剪刀(2)：内頸動脈・視神経上の膜を切開。' },
  'hint.idICA': { en: 'Dissector (4): tap the ICA.', ja: '剥離子(4)：内頸動脈をタップ。' },
  'hint.idOptic': { en: 'Dissector (4): tap the white optic nerve medial to the ICA.', ja: '剥離子(4)：内頸動脈内側の白い視神経をタップ。' },
  'hint.pcomVeil': { en: 'Tilt laterally (right-drag), then scissors (2) on the veil over the PCom.', ja: '外側へ傾け（右ドラッグ）、PCom上の膜を剪刀(2)で切開。' },
  'hint.idPCom': { en: 'Dissector (4): tap the PCom running posteromedially.', ja: '剥離子(4)：後内側へ走るPComをタップ。' },
  'hint.idAChA': { en: 'Dissector (4): tap the small AChA just distal to the PCom.', ja: '剥離子(4)：PCom遠位の細いAChAをタップ。' },
  'hint.neckProximal': { en: 'Dissector (4): small strokes on the cuff on the proximal side of the neck.', ja: '剥離子(4)：頸部近位側の組織を小さく剥離。' },
  'hint.neckDistal': { en: 'Dissector (4): small strokes on the distal side of the neck.', ja: '剥離子(4)：頸部遠位側を小さく剥離。' },
  'hint.domeTether': { en: 'Scissors (2): cut the band from the dome to the oculomotor nerve.', ja: '剪刀(2)：ドームから動眼神経への索を切離。' },
  'hint.clipApplied': { en: 'Available in milestone M5.', ja: 'M5で実装予定。' },
  'hint.neckOccluded': { en: 'Available in milestone M5.', ja: 'M5で実装予定。' },
  'hint.parentPatent': { en: 'Available in milestone M5.', ja: 'M5で実装予定。' },
  'hint.icgDone': { en: 'Available in milestone M5.', ja: 'M5で実装予定。' },
  'hint.pcomFlow': { en: 'Available in milestone M5.', ja: 'M5で実装予定。' },
  'hint.achaFlow': { en: 'Available in milestone M5.', ja: 'M5で実装予定。' },

  'msg.identified': { en: '{name} identified', ja: '{name}を同定' },
  'msg.alreadyIdentified': { en: '{name} already identified', ja: '{name}は同定済み' },
  'msg.notExposed': { en: 'Open the arachnoid over the {name} first', ja: 'まず{name}上のくも膜を開放' },
  'msg.stageComplete': { en: 'Stage {n} complete', ja: 'ステージ{n}完了' },

  'struct.ICA': { en: 'ICA', ja: '内頸動脈' },
  'struct.M1': { en: 'M1', ja: 'M1' },
  'struct.M2sup': { en: 'superior M2', ja: 'M2上幹' },
  'struct.M2inf': { en: 'inferior M2', ja: 'M2下幹' },
  'struct.A1': { en: 'A1', ja: 'A1' },
  'struct.PCom': { en: 'PCom', ja: '後交通動脈' },
  'struct.AChA': { en: 'anterior choroidal artery', ja: '前脈絡叢動脈' },
  'struct.optic': { en: 'optic nerve', ja: '視神経' },
  'struct.oculomotor': { en: 'oculomotor nerve', ja: '動眼神経' },
  'hud.help': { en: 'Controls', ja: '操作' },
  // ---- M4: vitals, rupture, temporary clip ----
  'msg.domeThinning': { en: 'The dome wall is blanching and thinning — stop handling the dome.', ja: 'ドーム壁が白く菲薄化しています — ドームの操作を止めてください。' },
  'msg.rupture': { en: 'Intraoperative rupture! Suction, then proximal control.', ja: '術中破裂！ 吸引で視野確保、次に近位血流遮断。' },
  'msg.bipolarArterial': { en: 'Bipolar cannot seal a torn aneurysm wall — it tears further. Get proximal control.', ja: 'バイポーラで破裂した瘤壁は止血できず、裂傷が広がります。近位遮断を。' },
  'msg.bloodObscures': { en: 'Blood hides the field — suction first.', ja: '血液で術野が見えません — まず吸引。' },
  'msg.tempProximal': { en: 'Temporary clip on the proximal ICA — inflow reduced. Occlusion timer running.', ja: 'ICA近位に一時遮断クリップ — 流入減少。遮断タイマー作動中。' },
  'msg.tempDistal': { en: 'Temporary clip distal to the aneurysm. With a proximal clip too, the aneurysm is trapped.', ja: '瘤より遠位に一時遮断クリップ。近位遮断と併用でトラッピング。' },
  'msg.tempClipOff': { en: 'Temporary clip removed after {time}.', ja: '一時遮断クリップ解除（遮断時間 {time}）。' },
  'msg.tempNotDome': { en: 'Never put a temporary clip on the dome.', ja: '一時遮断クリップをドームにかけてはいけません。' },
  'msg.tempIcaOnly': { en: 'In this simulator, temporary clips go on the supraclinoid ICA.', ja: '本シミュレーターでは一時遮断はICA（床突起上部）にかけます。' },
  'msg.tempTooClose': { en: 'Too close to the neck — leave room for the permanent clip.', ja: '頸部に近すぎます — 永久クリップの余地を残してください。' },
  'msg.tempAlready': { en: 'There is already a temporary clip on that side of the aneurysm.', ja: '瘤のその側には既に一時遮断クリップがあります。' },
  'tip.tempClip': { en: 'Click the exposed ICA to apply a temporary clip (proximal = inflow control); click a clip to remove it. Watch the timer.', ja: '露出したICAをクリックで一時遮断（近位＝流入制御）。クリップをクリックで解除。タイマーに注意。' },

  'vitals.title': { en: 'VITALS · NEUROMONITORING', ja: 'バイタル・神経モニタリング' },
  'vitals.ebl': { en: 'EBL', ja: '出血量' },
  'vitals.occ': { en: 'TEMP OCCLUSION', ja: '一時遮断' },
  'vitals.occTotal': { en: 'total', ja: '累計' },
  'vitals.sound': { en: 'Monitor sound on/off', ja: 'モニター音 オン/オフ' },
  'alarm.hrHigh': { en: 'Tachycardia', ja: '頻脈' },
  'alarm.hrLow': { en: 'Bradycardia', ja: '徐脈' },
  'alarm.bpLow': { en: 'Hypotension', ja: '低血圧' },
  'alarm.mepDrop': { en: 'MEP amplitude < {limit}%', ja: 'MEP振幅 < {limit}%' },
  'alarm.occlusionWarn': { en: 'Occlusion nearing {safe}', ja: '遮断時間が{safe}に接近' },
  'alarm.occlusionLong': { en: 'Occlusion > {safe} — release or reperfuse', ja: '遮断 > {safe} — 解除・再灌流を' },

  'crisis.title': { en: 'RUPTURE — BLEEDING CONTROL', ja: '破裂 — 止血手順' },
  'crisis.guide': { en: 'Stay calm. Keep the field visible with suction, get proximal control, then clip the neck. Never clip blindly into blood.', ja: '落ち着いて。吸引で視野を保ち、近位遮断を行ってから頸部をクリップ。血液の中で盲目的にクリップしない。' },
  'crisis.clearField': { en: 'Clear the field with suction', ja: '吸引で視野を確保' },
  'crisis.proximalControl': { en: 'Temporary clip on the proximal ICA', ja: 'ICA近位に一時遮断クリップ' },
  'crisis.definitiveClip': { en: 'Definitive clip across the neck (M5)', ja: '頸部に永久クリップ（M5）' },
  'crisis.releaseTemp': { en: 'Release the temporary clip', ja: '一時遮断クリップを解除' },
  'crisis.hint.clearField': { en: 'Suction (1): hold the tip in the blood pool until the proximal ICA is visible again.', ja: '吸引（1）：近位ICAが見えるまで血液プールの中で押し続ける。' },
  'crisis.hint.proximalControl': { en: 'Temporary clip (0): click the ICA between the clinoid and the aneurysm.', ja: '一時遮断クリップ（0）：床突起と瘤の間のICAをクリック。' },
  'crisis.hint.definitiveClip': { en: 'Permanent clip application arrives in M5. Keep suctioning; the occlusion clock is running.', ja: '永久クリップ操作はM5で実装。吸引を続けて。遮断時間が進行中。' },
  'crisis.hint.releaseTemp': { en: 'Temporary clip (0): click the clip to release it and restore flow.', ja: '一時遮断クリップ（0）：クリップをクリックして解除し血流を再開。' },
  'crisis.resolved': { en: 'Bleeding controlled.', ja: '止血完了。' },
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
