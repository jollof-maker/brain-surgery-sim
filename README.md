# IC-PC Aneurysm Clipping Simulator

A browser-based educational simulator of microsurgical clipping of a **right
internal carotid–posterior communicating artery (IC-PC) aneurysm** through a
**pterional, transsylvian approach**, seen through an operating microscope.

> **Educational / demonstration use only.** This is a simplified teaching model.
> It is **not** clinical training, a validated surgical simulator, an assessment
> tool or medical advice. Anatomy, physiology and scoring are stylized.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

Desktop Chrome, Edge or Firefox with WebGL2. Add `?quality=low` to the URL on weak
GPUs (no MSAA, no shadows, 1× resolution). The app also lowers its resolution by
itself if frames stay slow.

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check and production build into `dist/` |
| `npm test` | Unit tests (Vitest) for the pure models |
| `npm run smoke` | Headless browser check: loads the app, clicks Begin, reports console errors, saves screenshots to `smoke-out/` (`SMOKE_SCRIPT=scripts/scenario-m5.mjs` runs a scripted scenario) |

## Controls

| Input | Action |
|---|---|
| **1–0** | Select instrument (see below) |
| Left button | Use the instrument |
| Right-drag | Tilt the microscope (limited by the bony corridor) |
| Shift + right-drag / middle-drag | Pan |
| Wheel | Magnification |
| **F** / **R** | Focus at the cursor / reset the microscope |
| **Q / E**, **[ / ]**, **Backspace** | Clip rotation, clip depth, remove last clip (Q/E also turn the endoscope lens) |

| Key | Instrument | Use |
|---|---|---|
| 1 | Suction | Hold to aspirate blood (blobs and the pool) |
| 2 | Micro scissors | Cut arachnoid; cut sharp bands (PCom veil, dome tether) |
| 3 | Bipolar | Hold on an oozing point to coagulate |
| 4 | Dissector | Tap a vessel/nerve to identify it; slow strokes free the neck |
| 5 | Brain spatula | Click a lobe to seat, drag to retract gently |
| 6 | Aneurysm clip | Straight / curved (press 6 again); aim, rotate, set depth, click |
| 7 | ICG | Near-infrared videoangiography |
| 8 | Micro Doppler | Hold on a vessel or the dome: pitch = velocity, loudness = flow |
| 9 | Endoscope | 30° scope parked beside the aneurysm, picture-in-picture |
| 0 | Temporary clip | Proximal (or trapping) occlusion of the supraclinoid ICA |

## The procedure

1. **Open the sylvian fissure:** sharp arachnoid opening, dry field, spatulas seated.
2. **Identify M1** and follow it to A1.
3. **Identify the ICA and optic nerve:** open the carotid cistern.
4. **Confirm the PCom and dissect the neck:** PCom veil, PCom/AChA identification,
   proximal and distal neck, dome–oculomotor band.
5. **Clip the aneurysm:** neck fully closed, ICA not narrowed.
6. **Confirm patency:** ICG, PCom and AChA flow (Doppler, ICG or endoscope).

The **checklist** (left) and the **mentor** (bottom right) follow progress. Rough
handling of the dome raises a hidden rupture risk; after a rupture, the mentor shows
the **bleeding-control protocol**: suction → proximal temporary clip → definitive
clip → release. The **vitals** panel (top right) shows ECG, arterial line, SpO₂,
blood loss, MEP and the temporary-occlusion timer. The **debrief** opens when the
case is complete, or any time from the top bar.

**Demo mode** ("Watch demo" on the start screen, or "Demo" in the top bar) plays
the case through the same instrument code with captions. It continues from the
current state, and any click or key hands control back.

## How it is built

Vite + TypeScript + Three.js, `postprocessing` (depth of field, bloom, ACES,
vignette, grain, hover outline), Web Audio for every sound, no backend and no
downloaded assets (geometry, textures and sounds are procedural).
**1 scene unit = 1 mm**; origin at the IC-PC junction, +X lateral, +Y anterior,
+Z toward the microscope.

```
src/
  anatomy/     config.ts ★ every anatomical size/position/color, with learner notes
               brain, vessels (tapered tubes), aneurysm (6.6 mm dome + bleb), nerves,
               arachnoid and adhesions (cuttable), materials (wet tissue, pulsation)
  core/        SimState (single store + event bus), cardiac pulse and ECG waveforms
  scene/       renderer, microscope camera, post-processing, ICG view, endoscope view
  tools/       one file per instrument + ToolManager (picking, pose, input, demo pointer)
  physics/     physiology.ts ★ vitals/bleeding/rupture/temporary-clip tunables
               bleeding (droplets + pool), rupture risk, vitals, temporary occlusion,
               clipEval (geometric clip evaluation), flow (vessel flow graph), Clipping
  procedure/   stage definitions, StageMachine, exposure rules, rupture protocol,
               debrief scoring, DemoDirector
  audio/       AudioEngine (instruments, monitor beep, alarms, Doppler)
  ui/          shell, toolbar, checklist, mentor, vitals, debrief, Doppler HUD, i18n (EN/JA)
```

**Clip evaluation** is geometric: a clip is a closing blade line in its own frame.
The model measures the neck cross-section captured between the working part of the
blades, the remnant height above the parent wall, parent-artery pinching (circular
segment), and branches or nerves caught or kinked by the blades. These feed a small
**flow graph** (ICA → sac / PCom / ICA distal → AChA / M1 / A1, with retrograde PCom
and collateral flow), which drives ICG filling, Doppler sound, rupture bleeding,
vessel pulsation and MEP.

All tunables live in two commented files:
- `src/anatomy/config.ts` for anatomy.
- `src/physics/physiology.ts` for physiology and bleeding.

The thresholds that decide a good clip are `CLIP_OK` in `src/physics/clipEval.ts`.

## Limitations

- Stylized procedural anatomy for one patient; no deformable brain beyond simple
  lobe retraction and neck pinching.
- Physiology, rupture risk, flow and scores are illustrative teaching models,
  not validated simulations or clinical thresholds.
- Mouse and keyboard only; no haptics or VR.
- Not covered: cervical proximal control, anterior clinoidectomy, venous anatomy,
  perforators other than the AChA, and clip types other than straight and curved.
