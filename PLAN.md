# IC-PC Aneurysm Clipping Simulator — Plan

Browser-based educational simulator of microsurgical clipping of a right IC-PC aneurysm
via a pterional, transsylvian approach. **Education/demonstration only — not clinical
training or medical advice** (stated on the start screen and in the debrief).

## 1. Stack & conventions

- Vite + TypeScript (strict) + Three.js, `postprocessing` (pmndrs) for DoF / vignette / bloom.
- Web Audio API for Doppler, ECG beep, alarms. No backend; all state in memory.
- **Units: 1 scene unit = 1 mm.** Origin at the IC-PC junction, so the aneurysm and the
  clip math live in a clean local frame. Axes follow the surgeon's view of a right
  pterional exposure (+Y toward the microscope, frontal lobe up-screen, temporal lobe
  down-screen, skull base / ICA deep).
- Vitest for pure logic (clip evaluation, stage rules, vitals model, flow model).
- `tsc --noEmit` + `vite build` + a headless browser screenshot check after each milestone.

## 2. Folder layout

```
src/
  main.ts                 bootstrap, start screen, main loop
  core/                   EventBus, SimState (single in-memory store), clock
  scene/                  renderer, MicroscopeCamera, postprocessing, lighting, PiP (endoscope)
  anatomy/
    config.ts             ★ ALL tunable sizes/positions/colors (one file)
    vessels.ts            spline-based TubeGeometry (ICA, M1, M2s, A1, PCom, AChA)
    aneurysm.ts           6.6 mm dome + bleb, neck ring, posterolateral-inferior projection
    brain.ts nerves.ts arachnoid.ts   lobes, sylvian fissure, CN II/III, cuttable membranes
    materials.ts          moist/glossy tissue shaders, pulsation uniform, ICG mode
  tools/                  Tool interface + one file per tool, cursor models, Toolbar binding
  physics/                flow network, bleeding sources, blood particles + pool layer, rupture risk
  procedure/              StageMachine, stage definitions (goals/sub-tasks), DemoDirector
  audio/                  AudioEngine, Doppler synth, alarms
  ui/                     checklist, mentor, vitals (ECG canvas), toolbar, debrief, i18n (en/ja)
```

## 3. Key design decisions

**Camera ("microscope")** — orbit around a focal point with tight angular limits (the
corridor is narrow), wheel = magnification (FOV change, not dolly), right-drag = pan,
F = refocus on cursor point. DoF focus follows the focal point. Warm coaxial spotlight
attached to the camera, vignette as a circular eyepiece mask, soft bloom on wet highlights.

**Anatomy** — procedural first. Vessels are Catmull-Rom splines → `TubeGeometry` with
per-vessel radius from config. Lobes are deformed icospheres; spatulas push lobe vertices
via a simple retraction displacement. Arachnoid = several semi-transparent patch meshes,
each a cuttable "segment" (cut = fade out + edge curl). Pulsation: shared `uPulse` uniform
driven by the vitals heart rate, scaled per vessel (arteries > aneurysm dome > brain).

**Tools** — common interface:
`onHover(hit)`, `onPress/Drag/Release(hit)`, `canAct(state)`, cursor model, highlight rule.
Raycast against tagged meshes (`userData.kind = 'arachnoid' | 'vessel' | 'dome' | ...`).
Keys 1–0 select tools; clip tools add Q/E rotate, wheel/[ ] blade depth, Enter to apply,
Backspace to remove/reposition.

**Flow model** — tiny graph: ICA → {PCom, AChA, M1→M2s, A1, aneurysm}. Each edge has a
patency 0–1 computed from clips (temporary or permanent) and vessel injury. Flow drives
Doppler loudness, ICG fill timing, bleeding rate, and MEP.

**Clip evaluation (geometric)** — the clip's blade is modeled as a closing segment/plane
in the aneurysm's local frame. We compute:
- neck closure fraction (blade vs. sampled neck ring points),
- residual neck height (distance from blade to parent wall),
- ICA narrowing (blade penetration into the ICA tube radius),
- PCom / AChA occlusion (blade intersection with their origin segments).
Results feed the flow graph → shown through ICG (dome stays dark when occluded, PCom
lights up if patent) and Doppler, then summarized in the debrief.

**Bleeding** — `BleedSource { position, rate, type: 'ooze'|'arterial' }`. Instanced
particles for spurting/oozing + a pooling layer (a flat translucent mesh in the operative
cavity whose height = accumulated volume − suctioned volume). Bipolar stops `ooze`;
`arterial` (rupture) needs suction + temporary clip to bring rate down, then definitive clip.
Hidden `ruptureRisk` rises with force/drag speed on the dome (higher on the bleb), and
with dissection before the neck is exposed; rupture fires stochastically above threshold.

**Vitals** — simple physiologic model with smoothed random drift: blood loss → BP↓ HR↑;
temporary ICA occlusion time → MEP decline after ~5 min, faster if BP is low; recovers on
release. ECG drawn on a canvas (synthetic PQRST). Alarms via Web Audio on thresholds.

**Stages** — data-driven definitions, each with sub-tasks evaluated from SimState:
1. Open sylvian fissure (cut ≥ N arachnoid segments, place spatulas)
2. Identify M1 (expose + Doppler or dissector touch)
3. Identify ICA and optic nerve
4. Confirm PCom; dissect neck (proximal and distal neck freed)
5. Clip the aneurysm
6. Confirm PCom patency (ICG and/or Doppler)

**Demo mode** — `DemoDirector` runs a scripted timeline per stage that drives the *same*
tool APIs with an animated ghost cursor and camera moves. Any user click/key ends the
demo and hands control back at the current state.

**UI** — dark, semi-transparent panels, 1px borders, monospace numerics; checklist (left),
vitals (top right), mentor (bottom right, collapsible, sub-task checkboxes + %), toolbar
(bottom). All strings in `ui/i18n.ts` (EN/JA), toggle top bar.

## 4. Milestones (each one runnable)

| | Scope | You can test |
|---|---|---|
| **M1** | Vite scaffold, renderer, microscope camera + postFX, procedural anatomy, `config.ts`, start screen + disclaimer | Orbit/zoom/pan the field; see lobes, fissure, arachnoid, vessels, nerves, aneurysm with bleb; pulsation |
| **M2** | Toolbar, 10 tools with cursors/hover highlights, basic interactions (cut, dissect, spatula, bipolar on ooze, suction stub) | Cut arachnoid, retract lobes, dissect neck tissue |
| **M3** | StageMachine, checklist, mentor panel, i18n toggle | Progress through stages 1–4 by doing the goals |
| **M4** | Vitals + ECG, bleeding/oozing, blood pool, suction, rupture risk + rupture event, temporary clip + occlusion timer | Provoke rupture, recover with suction + temp clip; watch vitals react |
| **M5** | Permanent clips (straight/curved), positioning/rotation/depth, clip evaluation, flow model, ICG view, Doppler audio, endoscope PiP | Good vs. bad clip placement visibly changes ICG/Doppler |
| **M6** | Debrief, demo mode with take-over, audio polish, performance, README | Full run from start to debrief, demo playback |

After each milestone: `tsc`, `vitest`, `vite build`, start the dev server, check the
browser console via a headless screenshot, fix errors, then report what to test.

## 5. Scope notes / assumptions

- Anatomy is stylized and procedural; proportions follow typical adult values (ICA ≈ 4 mm,
  M1 ≈ 3 mm, A1 ≈ 2 mm, PCom ≈ 1.5 mm, AChA ≈ 1 mm) and are all editable in `config.ts`.
  Sharp-dissection details, clip catalog shapes and physiology are simplified teaching
  models, not validated simulations.
- Mouse + keyboard only (no haptics/VR). Desktop Chrome/Edge/Firefox target.
- Proximal control via the cervical ICA and anterior clinoidectomy are out of scope;
  temporary clip goes on the supraclinoid ICA.
- No assets downloaded; all geometry, textures (canvas-generated) and sounds are procedural.
