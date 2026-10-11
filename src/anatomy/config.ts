/**
 * ANATOMY CONFIG — every tunable size, position and color lives here.
 *
 * Units: 1 scene unit = 1 mm.
 * Frame (surgeon's view of a RIGHT pterional, transsylvian exposure):
 *   +X  lateral  (screen right, toward the sylvian fissure / temporal pole)
 *   -X  medial   (screen left, toward the optic chiasm / midline)
 *   +Y  anterior (screen up, frontal lobe side)
 *   -Y  posterior (screen down, temporal lobe side)
 *   +Z  superficial (toward the microscope)
 *   -Z  deep (toward the skull base / tentorium)
 * Origin: the ICA centerline at the level of the PCom origin (the "IC-PC junction").
 *
 * The anatomy is stylized for teaching. Diameters follow typical adult values.
 */

export type Vec3 = [number, number, number];

export interface VesselDef {
  id: VesselId;
  /** Catmull-Rom control points, proximal → distal. */
  points: Vec3[];
  /** Radius at the proximal and distal ends (linearly tapered). */
  radius: [number, number];
  /** Relative pulsation amplitude (big elastic arteries move more). */
  pulse: number;
}

export type VesselId = 'ICA' | 'M1' | 'M2sup' | 'M2inf' | 'A1' | 'PCom' | 'AChA';

export const ANATOMY = {
  vessels: {
    /**
     * Supraclinoid internal carotid artery. It emerges from the distal dural
     * ring next to the anterior clinoid process (deep, anterior), runs
     * posteriorly, laterally and upward, gives off the PCom and then the
     * anterior choroidal artery from its POSTERIOR wall, and ends at the
     * carotid bifurcation (M1 + A1).
     */
    ICA: {
      id: 'ICA',
      points: [[0.2, 10, -8.5], [0, 5, -4.2], [0, 0, 0], [1.8, -3.5, 2.2], [3.5, -6, 4.5]],
      radius: [2.1, 1.9],
      pulse: 1,
    },
    /** M1 (sphenoidal) segment of the MCA, running laterally inside the sylvian fissure. */
    M1: {
      id: 'M1',
      points: [[3.5, -6, 4.5], [9, -6.5, 6.5], [15, -6.5, 8], [19, -6, 9]],
      radius: [1.5, 1.35],
      pulse: 0.8,
    },
    /** Superior M2 trunk (after the MCA bifurcation), heading to the frontal operculum. */
    M2sup: {
      id: 'M2sup',
      points: [[19, -6, 9], [23, -2.5, 11], [28, 0, 13], [32, 1.5, 14]],
      radius: [1.05, 0.9],
      pulse: 0.6,
    },
    /** Inferior M2 trunk, heading to the temporal operculum. */
    M2inf: {
      id: 'M2inf',
      points: [[19, -6, 9], [23, -9.5, 10.5], [28, -12, 11.5], [32, -13.5, 12]],
      radius: [1.0, 0.85],
      pulse: 0.6,
    },
    /** A1 segment of the ACA, running medially over the optic nerve/chiasm. */
    A1: {
      id: 'A1',
      points: [[3.5, -6, 4.5], [0, -3, 6.5], [-5, 1, 7.5], [-11, 4, 7.5]],
      radius: [1.05, 0.95],
      pulse: 0.6,
    },
    /**
     * Posterior communicating artery. Arises from the posteromedial ICA wall
     * and runs posteriorly, medially and deep, ABOVE the oculomotor nerve,
     * to join the PCA. In IC-PC aneurysms it is often hidden behind the dome
     * and must be positively identified before clipping.
     */
    PCom: {
      id: 'PCom',
      points: [[0, 0, 0], [-1.2, -3.5, -2.2], [-2.5, -7.5, -4], [-3.5, -11, -5]],
      radius: [0.8, 0.7],
      pulse: 0.4,
    },
    /**
     * Anterior choroidal artery. Arises a few mm distal to the PCom and runs
     * posterolaterally. Small but critical (internal capsule supply):
     * occluding it with the clip can cause hemiplegia.
     */
    AChA: {
      id: 'AChA',
      points: [[1.8, -3.5, 2.2], [4, -5.5, 1], [6.5, -8.5, 0], [9, -11, -1]],
      radius: [0.5, 0.42],
      pulse: 0.3,
    },
  } satisfies Record<VesselId, VesselDef>,

  /**
   * The IC-PC aneurysm. It arises from the ICA wall at the PCom origin and
   * projects posterolaterally and downward (toward the tentorium and the
   * oculomotor nerve — which is why these aneurysms can present with a
   * third-nerve palsy).
   */
  aneurysm: {
    /** Point on the ICA centerline the neck sits on (the IC-PC junction). */
    origin: [0, 0, 0] as Vec3,
    /** Projection direction (normalized at build time): posterolateral + inferior. */
    direction: [0.65, -0.6, -0.45] as Vec3,
    /** Maximum dome diameter (mm). */
    domeDiameter: 6.6,
    /** Neck diameter (mm). Dome/neck ratio > ~1.5 favours clipping. */
    neckDiameter: 3.8,
    /** Neck length from the parent wall to where the dome starts to balloon (mm). */
    neckLength: 1.0,
    /** Elongation of the dome along its axis (1 = spherical). */
    domeElongation: 1.08,
    /** Daughter sac (bleb) — the thinnest, most rupture-prone part of the wall. */
    bleb: {
      /** Position on the dome surface: angles (deg) away from the dome tip. */
      polarDeg: 38,
      /** 0° = lateral side of the dome; -90° ≈ superficial (facing the microscope). */
      azimuthDeg: -100,
      radius: 0.95,
    },
    /** Dome wall pulsates more than the parent artery (thin, compliant wall). */
    pulse: 1.4,
  },

  nerves: {
    /** Optic nerve (CN II): medial to the ICA, running from the optic canal to the chiasm. */
    optic: {
      points: [[-4.5, 11, -7], [-6.5, 6, -6.5], [-9, 0, -6], [-13, -4, -5.5]] as Vec3[],
      radius: 2.2,
      /** Flattened cross-section (width:height). */
      flatten: 0.65,
    },
    /** Oculomotor nerve (CN III): deep and posterior, running forward under the PCom. */
    oculomotor: {
      points: [[-6, -15, -9.5], [-1, -9, -8.5], [3, -3, -8.8], [6, 3, -9.5]] as Vec3[],
      radius: 1.2,
      flatten: 1,
    },
  },

  brain: {
    /**
     * Lobes are superellipsoids (center, radii x/y/z, exponent). Exponent 2 is an
     * ellipsoid; higher values give the flatter, steeper walls of an opened fissure.
     * Positions are the RETRACTED (opened) state.
     * Frontal lobe: its orbital surface overhangs the optic nerve and proximal ICA.
     */
    frontal: { center: [8, 27, -8] as Vec3, radii: [42, 18, 28] as Vec3, exponent: 2.2 },
    /** Temporal lobe: its medial surface (uncus) hides the distal PCom and CN III. */
    temporal: { center: [16, -28, -10] as Vec3, radii: [36, 16, 28] as Vec3, exponent: 2.2 },
    /** Gyral bumpiness amplitude (mm) and spatial frequency. */
    gyriAmplitude: 1.1,
    gyriFrequency: 0.16,
    /**
     * How far each lobe moves back toward the midline of the fissure (mm) when
     * retraction goes from 1 (opened, spatulas seated) to 0 (closed fissure).
     */
    maxRetraction: 4,
    /** Retraction at load (0..1). */
    initialRetraction: 1,
    /** Deep floor (basal cisterns / tentorial region) depth. */
    floorZ: -17,
  },

  /**
   * Arachnoid membranes. Each band is split into segments that can be cut
   * individually with the micro scissors.
   */
  arachnoid: {
    /** Superficial sylvian arachnoid bridging the frontal and temporal opercula. */
    sylvian: { from: [-2, -1.5, 14] as Vec3, to: [34, -2.5, 14] as Vec3, width: 34, segments: 6, opacity: 0.42 },
    /** Deeper carotid cistern arachnoid over the ICA and the aneurysm. */
    carotid: { from: [-9, 1, 4] as Vec3, to: [10, -6, 4] as Vec3, width: 22, segments: 4, opacity: 0.38 },
  },

  /** Brain spatulas (retractor blades). */
  spatulas: [
    { id: 'frontal', tip: [14, 11.6, 4] as Vec3, handleDir: [0.1, 0.33, 1] as Vec3, width: 6, length: 60 },
    { id: 'temporal', tip: [20, -14.8, 4] as Vec3, handleDir: [0.15, -0.35, 1] as Vec3, width: 6, length: 60 },
  ],

  colors: {
    artery: 0xb0504a,
    arteryDeep: 0x8f2a2c,
    aneurysmWall: 0xc98576,
    bleb: 0xb3302f,
    brain: 0xcf968c,
    brainVessel: 0x8c2a2a,
    nerve: 0xdcd0b6,
    arachnoid: 0xf2efe8,
    floor: 0x2a1210,
    spatula: 0xc9ccd1,
  },

  /** Microscope defaults. Working distance in mm. */
  microscope: {
    workingDistance: 260,
    /** Initial look-at point. */
    target: [2, -2, 0] as Vec3,
    /** Viewing direction (from target toward the scope), normalized at build time. */
    viewDir: [0.32, 0.18, 1] as Vec3,
    /** Max tilt away from viewDir (deg) — the bony corridor limits the angle. */
    maxTiltDeg: 32,
    /** Field-of-view diameter range at the focal plane (mm). */
    fieldMin: 9,
    fieldMax: 60,
    fieldInitial: 32,
  },
} as const;

export type AnatomyConfig = typeof ANATOMY;
