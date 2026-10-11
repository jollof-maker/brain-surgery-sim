import * as THREE from 'three';
import { ANATOMY } from './config';

/**
 * Shared uniforms injected into every tissue material.
 * uPulse: arterial pulse 0..1 (from SimState), updated once per frame.
 */
export const tissueUniforms = {
  uPulse: { value: 0 },
};

/**
 * Adds pulsation to a standard/physical material: vertices are pushed out
 * along their normal by `uPulse * amplitude` (mm). Arteries expand during
 * systole; the thin aneurysm wall expands more than the parent vessel.
 */
function withPulsation<T extends THREE.MeshStandardMaterial>(mat: T, amplitude: number): T {
  if (amplitude <= 0) return mat;
  // Kept on userData so flow changes (clips) can scale a vessel's pulsation at runtime.
  const amp = { value: amplitude };
  mat.userData.pulseAmp = amp;
  mat.userData.pulseBase = amplitude;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPulse = tissueUniforms.uPulse;
    shader.uniforms.uPulseAmp = amp;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uPulse;\nuniform float uPulseAmp;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed += objectNormal * uPulse * uPulseAmp;',
      );
  };
  // Distinct cache key per amplitude so three.js doesn't share the program uniform value.
  mat.customProgramCacheKey = () => `pulse-${amplitude}`;
  return mat;
}

// ---------------------------------------------------------------------------
// Procedural canvas textures (no downloaded assets)
// ---------------------------------------------------------------------------

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function hex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

/** Draws a meandering, branching vessel line (random walk) — pial vessels. */
function drawPialVessel(
  ctx: CanvasRenderingContext2D, rand: () => number, x: number, y: number,
  angle: number, width: number, depth: number,
): void {
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  const steps = 18 + Math.floor(rand() * 20);
  for (let i = 0; i < steps; i++) {
    angle += (rand() - 0.5) * 0.7;
    x += Math.cos(angle) * 6;
    y += Math.sin(angle) * 6;
    ctx.lineTo(x, y);
    if (depth < 2 && rand() < 0.08) {
      ctx.stroke();
      drawPialVessel(ctx, rand, x, y, angle + (rand() < 0.5 ? 0.9 : -0.9), width * 0.6, depth + 1);
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  }
  ctx.stroke();
}

/** Cortex surface: pink-tan base, mottling, and fine pial arteries/veins. */
function makeBrainTextures(): { map: THREE.Texture; bump: THREE.Texture } {
  const size = 1024;
  const [c, ctx] = canvas(size);
  const [bc, bctx] = canvas(size);
  const rand = seededRandom(7);

  ctx.fillStyle = hex(ANATOMY.colors.brain);
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // Mottling: soft blotches of slightly different tint, and matching bump.
  for (let i = 0; i < 1400; i++) {
    const x = rand() * size, y = rand() * size, r = 6 + rand() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const tint = rand() < 0.5 ? '200,120,110' : '235,190,170';
    g.addColorStop(0, `rgba(${tint},0.10)`);
    g.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    const bg = bctx.createRadialGradient(x, y, 0, x, y, r);
    const v = rand() < 0.5 ? 255 : 0;
    bg.addColorStop(0, `rgba(${v},${v},${v},0.08)`);
    bg.addColorStop(1, `rgba(${v},${v},${v},0)`);
    bctx.fillStyle = bg;
    bctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Pial vessels: arteries (bright red) and veins (darker, bluish-purple).
  ctx.lineCap = bctx.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const vein = rand() < 0.35;
    ctx.strokeStyle = vein ? 'rgba(90,30,55,0.75)' : `rgba(140,30,35,${0.45 + rand() * 0.35})`;
    bctx.strokeStyle = 'rgba(255,255,255,0.7)';
    const x = rand() * size, y = rand() * size, a = rand() * Math.PI * 2, w = 1.5 + rand() * (vein ? 4 : 3);
    const r1 = seededRandom(i * 97 + 3), r2 = seededRandom(i * 97 + 3);
    drawPialVessel(ctx, r1, x, y, a, w, 0);
    drawPialVessel(bctx, r2, x, y, a, w, 0);
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  const bump = new THREE.CanvasTexture(bc);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  return { map, bump };
}

/** Vessel wall: fine longitudinal streaks and tiny vasa vasorum. u runs along the vessel. */
function makeVesselTexture(): THREE.Texture {
  const [c, ctx] = canvas(256);
  const rand = seededRandom(21);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    const y = rand() * 256;
    ctx.strokeStyle = `rgba(${rand() < 0.5 ? '255,235,225' : '150,60,60'},${0.02 + rand() * 0.04})`;
    ctx.lineWidth = 1 + rand() * 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(80, y + (rand() - 0.5) * 8, 170, y + (rand() - 0.5) * 8, 256, y);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Nerve: parallel fascicles running along the nerve (u axis). */
function makeNerveTexture(): THREE.Texture {
  const [c, ctx] = canvas(256);
  const rand = seededRandom(33);
  ctx.fillStyle = hex(ANATOMY.colors.nerve);
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 3 + rand() * 4) {
    ctx.strokeStyle = `rgba(${rand() < 0.5 ? '255,252,240' : '190,165,130'},${0.08 + rand() * 0.12})`;
    ctx.lineWidth = 1 + rand() * 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y + (rand() - 0.5) * 3);
    ctx.stroke();
  }
  // a few tiny surface vessels on the pia of the nerve
  ctx.strokeStyle = 'rgba(150,40,40,0.5)';
  for (let i = 0; i < 6; i++) {
    const y = rand() * 256;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(90, y + 20 * (rand() - 0.5), 160, y + 20 * (rand() - 0.5), 256, y);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Arachnoid: wispy, fibrous, mostly transparent. */
function makeArachnoidTexture(): THREE.Texture {
  const [c, ctx] = canvas(512);
  const rand = seededRandom(55);
  ctx.clearRect(0, 0, 512, 512);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(0, 0, 512, 512);
  // Milky clouding
  for (let i = 0; i < 90; i++) {
    const x = rand() * 512, y = rand() * 512, r = 20 + rand() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Fine trabecular fibers
  for (let i = 0; i < 140; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.08 + rand() * 0.25})`;
    ctx.lineWidth = 0.4 + rand() * 1.0;
    const x = rand() * 512, y = rand() * 512, a = rand() * Math.PI;
    const l = 30 + rand() * 140;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(a) * l * 0.5 + (rand() - 0.5) * 40, y + Math.sin(a) * l * 0.5 + (rand() - 0.5) * 40,
      x + Math.cos(a) * l, y + Math.sin(a) * l,
    );
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------------------
// Material factory
// ---------------------------------------------------------------------------

let textures: ReturnType<typeof buildTextures> | null = null;
function buildTextures() {
  return {
    brain: makeBrainTextures(),
    vessel: makeVesselTexture(),
    nerve: makeNerveTexture(),
    arachnoid: makeArachnoidTexture(),
  };
}
function tex() {
  return (textures ??= buildTextures());
}

/** Wet tissue = moderately rough base + a glossy clear-coat film of CSF. */
const WET = { clearcoat: 1, clearcoatRoughness: 0.12 } as const;

export const Materials = {
  brain(): THREE.MeshPhysicalMaterial {
    const t = tex().brain;
    const map = t.map.clone();
    map.repeat.set(3, 2);
    const bump = t.bump.clone();
    bump.repeat.copy(map.repeat);
    map.needsUpdate = bump.needsUpdate = true;
    return withPulsation(new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map, bumpMap: bump, bumpScale: 0.6,
      roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color(0xffd0c0), sheenRoughness: 0.5,
      ...WET,
    }), 0.05);
  },

  artery(pulse: number, color: number = ANATOMY.colors.artery): THREE.MeshPhysicalMaterial {
    return withPulsation(new THREE.MeshPhysicalMaterial({
      color, map: tex().vessel, roughness: 0.38,
      sheen: 0.3, sheenColor: new THREE.Color(0xffb0a0),
      ...WET,
    }), 0.12 * pulse);
  },

  /** Aneurysm wall: thinner and paler than the parent artery, slightly translucent-looking. */
  aneurysm(pulse: number): THREE.MeshPhysicalMaterial {
    return withPulsation(new THREE.MeshPhysicalMaterial({
      color: ANATOMY.colors.aneurysmWall, vertexColors: true, map: tex().vessel, roughness: 0.3,
      sheen: 0.6, sheenColor: new THREE.Color(0xffc8b8),
      ...WET,
    }), 0.16 * pulse);
  },

  nerve(): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: tex().nerve, roughness: 0.42, sheen: 0.5,
      sheenColor: new THREE.Color(0xfff2d8), ...WET,
    });
  },

  /** Thicker, fibrous arachnoid trabeculae around the aneurysm (dissection targets). */
  adhesion(opacity: number, color: number): THREE.MeshPhysicalMaterial {
    const map = tex().arachnoid.clone();
    map.repeat.set(3, 3);
    map.needsUpdate = true;
    return new THREE.MeshPhysicalMaterial({
      color, map, transparent: true, opacity, vertexColors: true, roughness: 0.4,
      sheen: 0.6, sheenColor: new THREE.Color(0xffffff), clearcoat: 0.8, clearcoatRoughness: 0.2,
      side: THREE.DoubleSide, depthWrite: false,
    });
  },

  arachnoid(opacity: number): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color: ANATOMY.colors.arachnoid, map: tex().arachnoid, transparent: true, opacity,
      vertexColors: true, roughness: 0.3, side: THREE.DoubleSide, depthWrite: false, ...WET,
    });
  },

  floor(): THREE.MeshPhysicalMaterial {
    const t = tex().brain;
    return new THREE.MeshPhysicalMaterial({
      color: ANATOMY.colors.floor, bumpMap: t.bump, bumpScale: 0.4, roughness: 0.85,
    });
  },

  spatula(): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color: ANATOMY.colors.spatula, metalness: 0.55, roughness: 0.3,
    });
  },
};
