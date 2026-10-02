import { ConeGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, type BufferGeometry } from 'three';
import { ACCESSORIES } from '@palmhaven/shared';
import { PartBuilder, type PartKind, type Transform } from '../render/PartBuilder.js';
import { block, cone, cylinder, shade } from './shapes.js';

/**
 * HELD ITEMS AND WORN ACCESSORIES, built from blocks for every key in the
 * shared ITEMS and ACCESSORIES tables: chunky, clean Roblox plastic that still
 * reads at a few pixels tall.
 *
 *   - Items are built in the RIGHT HAND's frame (grip at the origin, +Y out
 *     of the fist, +Z the item's front). Carried things (briefcase, boombox,
 *     med kit) hang below the grip on -Y.
 *   - Hats and face items are built in the HEAD frame (a unit cube, face +Z).
 *   - Back items are built in the BACK frame, in world units (-Z behind).
 */

const PI = Math.PI;
type Build = (b: PartBuilder) => void;
type BuildColored = (b: PartBuilder, c: number) => void;

const GOLD = 0xffcf33;
const SILVER = 0xc8ccd4;
const DARK = 0x1a1a1a;
const WHITE = 0xffffff;
const RED = 0xe03c3c;

// ------------------------------------------------------------ helpers

/** A sphere with explicit segments (the triangle budget is tight). */
const orb = (b: PartBuilder, r: number, color: number, t: Transform = {}, w = 8, h = 6, kind: PartKind = 'smooth'): void => {
  b.add(new SphereGeometry(r, w, h), color, kind, t);
};

/** A torus (handles, bands, a donut). Lies in the XY plane, axis +Z. */
const torus = (b: PartBuilder, r: number, tube: number, color: number, t: Transform = {}, radial = 4, tubular = 10, arc = PI * 2): void => {
  b.add(new TorusGeometry(r, tube, radial, tubular, arc), color, 'smooth', t);
};

/** A half cylinder lying along Z, round side down, flat side up (a taco, a melon slice). */
const halfDisc = (b: PartBuilder, r: number, depth: number, color: number, t: Transform = {}, segments = 10): void => {
  b.add(new CylinderGeometry(r, r, depth, segments, 1, false, -PI / 2, PI), color, 'smooth', { ...t, rx: PI / 2 });
};

/** The same surface facing the other way (the underside of a canopy). */
const flipped = (geometry: BufferGeometry): BufferGeometry => {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  for (const name of ['position', 'normal', 'uv']) {
    const attr = g.getAttribute(name);
    if (!attr) continue;
    const size = attr.itemSize;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < attr.count; i += 3) {
      for (let k = 0; k < size; k += 1) {
        const a = (i + 1) * size + k;
        const c = (i + 2) * size + k;
        const tmp = arr[a]!;
        arr[a] = arr[c]!;
        arr[c] = tmp;
      }
    }
  }
  const normal = g.getAttribute('normal');
  if (normal) {
    const arr = normal.array as Float32Array;
    for (let i = 0; i < arr.length; i += 1) arr[i] = -arr[i]!;
  }
  return g;
};

/** A thin surface seen from both sides, the back a shade darker. */
const twoSided = (b: PartBuilder, geometry: BufferGeometry, color: number, t: Transform): void => {
  const back = flipped(geometry);
  b.add(geometry, color, 'smooth', t);
  b.add(back, shade(color, 0.82), 'smooth', t);
};

/** Rotation that turns +Y to point along a direction. */
const aim = (dx: number, dy: number, dz: number): { rx: number; ry: number } => {
  const len = Math.hypot(dx, dy, dz) || 1;
  return { rx: Math.acos(Math.max(-1, Math.min(1, dy / len))), ry: Math.atan2(dx, dz) };
};

// ------------------------------------------------------------ food

const burger: Build = (b) => {
  const bun = 0xe0a050;
  cylinder(b, 0.34, 0.3, 0.14, shade(bun, 0.95), { y: 0.3 }, 'smooth', 12);
  cylinder(b, 0.37, 0.37, 0.11, 0x6a3a1e, { y: 0.42 }, 'smooth', 12);
  block(b, 0.6, 0.04, 0.6, 0xffc93c, { y: 0.49, ry: PI / 4 });
  cylinder(b, 0.39, 0.39, 0.04, 0x5cc43a, { y: 0.52 }, 'smooth', 10);
  cylinder(b, 0.32, 0.35, 0.12, bun, { y: 0.6 }, 'smooth', 12);
  cylinder(b, 0.17, 0.32, 0.09, bun, { y: 0.705 }, 'smooth', 12);
  for (const [x, y, z] of [[0.2, 0.71, 0.12], [-0.08, 0.71, 0.22], [0.02, 0.755, -0.04]] as const) {
    block(b, 0.07, 0.03, 0.04, 0xfff3d0, { x, y, z, ry: x * 4 });
  }
};

const fries: Build = (b) => {
  cylinder(b, 0.3, 0.22, 0.42, 0xe8322e, { y: 0.28, ry: PI / 4 }, 'smooth', 4);
  block(b, 0.2, 0.14, 0.03, 0xffd23f, { y: 0.3, z: 0.19, rx: 0.133 });
  const sticks: readonly (readonly [number, number, number, number])[] = [
    [-0.12, -0.08, 0.2, 0.02],
    [-0.05, 0.08, -0.08, 0.06],
    [0.03, -0.1, 0.05, 0.1],
    [0.1, 0.06, -0.18, 0.0],
    [0.14, -0.04, -0.12, 0.05],
    [-0.14, 0.04, 0.12, 0.08],
    [0.0, 0.0, 0.0, 0.12],
  ];
  for (const [x, z, rz, dy] of sticks) block(b, 0.065, 0.42, 0.065, 0xffcf4a, { x, y: 0.55 + dy, z, rz, rx: z * 1.5 });
};

const hotdog: Build = (b) => {
  for (const x of [-0.09, 0.09]) cylinder(b, 0.13, 0.13, 0.72, 0xe6a85a, { x, y: 0.45, sz: 0.9 }, 'smooth', 8);
  cylinder(b, 0.1, 0.1, 0.86, 0xc0452a, { y: 0.45, z: 0.06 }, 'smooth', 8);
  for (const y of [0.02, 0.88]) orb(b, 0.1, 0xc0452a, { y, z: 0.06 }, 6, 4);
  for (let i = 0; i < 5; i += 1) block(b, 0.16, 0.035, 0.03, 0xffd23f, { y: 0.2 + i * 0.12, z: 0.165, rz: i % 2 ? 0.6 : -0.6 });
};

const pizza: Build = (b) => {
  // Triangular prisms turned so the point is up (+Y) and the faces are front and back.
  b.add(new CylinderGeometry(0.52, 0.52, 0.07, 3), 0xf0c060, 'smooth', { y: 0.55, rx: -PI / 2 });
  b.add(new CylinderGeometry(0.44, 0.44, 0.04, 3), 0xffd84a, 'smooth', { y: 0.57, z: 0.04, rx: -PI / 2 });
  cylinder(b, 0.07, 0.07, 0.9, 0xc8803a, { y: 0.29, rz: PI / 2 }, 'smooth', 8);
  for (const [x, y] of [[0, 0.75], [-0.13, 0.5], [0.13, 0.52]] as const) {
    cylinder(b, 0.08, 0.08, 0.03, 0xc8302a, { x, y, z: 0.065, rx: PI / 2 }, 'smooth', 8);
  }
  block(b, 0.06, 0.12, 0.03, 0xffd84a, { x: 0.2, y: 0.33, z: 0.05 });
};

const taco: Build = (b) => {
  halfDisc(b, 0.34, 0.28, 0xf0c44a, { y: 0.5 }, 10);
  block(b, 0.66, 0.1, 0.24, 0x5cc43a, { y: 0.52 });
  block(b, 0.5, 0.1, 0.18, 0xf3dcc0, { y: 0.59 });
  block(b, 0.46, 0.03, 0.19, WHITE, { y: 0.645 });
  for (const x of [-0.16, 0.02, 0.17]) block(b, 0.08, 0.06, 0.08, 0xe0402a, { x, y: 0.67, z: x * 0.3 });
  for (const x of [-0.3, 0.3]) block(b, 0.12, 0.05, 0.2, 0x7ad04a, { x, y: 0.57, rz: x });
  block(b, 0.1, 0.05, 0.08, 0x9a4ac8, { x: -0.06, y: 0.67, z: -0.04 });
};

const donut: Build = (b) => {
  torus(b, 0.24, 0.12, 0xd9a066, { y: 0.5 }, 5, 12);
  torus(b, 0.24, 0.115, 0xff8fbf, { y: 0.5, z: 0.035, sz: 0.85 }, 4, 12);
  const colors = [0xffffff, 0x3a86ff, 0xffd23f, 0x2ec4b6, 0xff3d3d];
  colors.forEach((color, i) => {
    const a = (i / colors.length) * PI * 2 + 0.3;
    block(b, 0.08, 0.025, 0.02, color, { x: Math.cos(a) * 0.24, y: 0.5 + Math.sin(a) * 0.24, z: 0.14, rz: a * 2.3 });
  });
};

const croissant: Build = (b) => {
  const c = 0xe0a04a;
  const R = 0.28;
  const at = (a: number): { x: number; y: number } => ({ x: R * Math.sin(a), y: 0.25 + R * Math.cos(a) });
  // Three swollen segments along an arc, tapering out to two horns (+Y of each points round the arc).
  const segments: readonly (readonly [number, number, number])[] = [
    [-0.65, 0.16, 0.11],
    [0, 0.17, 0.17],
    [0.65, 0.11, 0.16],
  ];
  for (const [a, top, bottom] of segments) cylinder(b, top, bottom, 0.26, c, { ...at(a), rz: -PI / 2 - a, sz: 0.85 }, 'smooth', 8);
  for (const a of [-1.25, 1.25]) {
    const outward = a > 0 ? -PI / 2 - a : PI / 2 - a;
    cone(b, 0.1, 0.26, c, { ...at(a), rz: outward, sz: 0.85 }, 'smooth', 8);
  }
  for (const a of [-0.98, -0.33, 0.33, 0.98]) {
    const r = Math.abs(a) > 0.5 ? 0.12 : 0.165;
    cylinder(b, r, r, 0.04, shade(c, 0.78), { ...at(a), rz: -PI / 2 - a, sz: 0.85 }, 'smooth', 8);
  }
};

const sandwich: Build = (b) => {
  const bread = 0xe8b468;
  for (const z of [-0.1, 0.1]) block(b, 0.46, 0.8, 0.09, bread, { y: 0.5, z });
  block(b, 0.5, 0.76, 0.05, 0xf08a9a, { y: 0.5, z: -0.035 });
  block(b, 0.53, 0.74, 0.03, 0xffd23f, { y: 0.5, z: 0.005 });
  block(b, 0.48, 0.72, 0.03, 0xd8a090, { y: 0.5, z: 0.035 });
  for (const [x, y] of [[0.25, 0.3], [-0.25, 0.55], [0.25, 0.72]] as const) block(b, 0.08, 0.1, 0.03, 0x5a9a3a, { x, y, z: 0.035 });
  for (const z of [-0.147, 0.147]) {
    for (const y of [0.3, 0.5, 0.7]) block(b, 0.38, 0.03, 0.01, 0x8a5428, { y, z, rz: 0.45 });
  }
};

const icecream: Build = (b) => {
  cone(b, 0.18, 0.52, 0xd9a05a, { y: 0.24, rz: PI }, 'smooth', 10);
  cylinder(b, 0.2, 0.19, 0.07, 0xc88a44, { y: 0.5 }, 'smooth', 10);
  orb(b, 0.22, 0xff9ec4, { y: 0.66 }, 10, 8);
  cylinder(b, 0.05, 0.05, 0.12, 0xff9ec4, { x: 0.1, y: 0.53, z: 0.15 }, 'smooth', 6);
  orb(b, 0.07, 0xd81e3a, { y: 0.9 }, 6, 4);
  block(b, 0.015, 0.1, 0.015, 0x3a7a2a, { x: 0.02, y: 0.98, rz: -0.3 });
};

const watermelon: Build = (b) => {
  const top = 0.55;
  halfDisc(b, 0.42, 0.14, 0x2f9e44, { y: top }, 12);
  halfDisc(b, 0.37, 0.15, 0xe9f5c8, { y: top }, 12);
  halfDisc(b, 0.34, 0.16, 0xff4f5e, { y: top }, 12);
  // Close the cut face on top.
  block(b, 0.84, 0.016, 0.14, 0x2f9e44, { y: top });
  block(b, 0.74, 0.02, 0.15, 0xe9f5c8, { y: top + 0.001 });
  block(b, 0.68, 0.024, 0.16, 0xff4f5e, { y: top + 0.002 });
  for (const [x, y] of [[-0.15, 0.45], [0, 0.4], [0.15, 0.45], [-0.07, 0.31], [0.08, 0.32]] as const) {
    block(b, 0.035, 0.06, 0.02, 0x2a1a10, { x, y, z: 0.085, rz: x * 2 });
  }
};

const coffee: Build = (b) => {
  cylinder(b, 0.24, 0.2, 0.04, WHITE, { y: 0.16 }, 'smooth', 12);
  cylinder(b, 0.15, 0.11, 0.24, WHITE, { y: 0.3 }, 'smooth', 12);
  cylinder(b, 0.135, 0.135, 0.02, 0x5a3218, { y: 0.415 }, 'smooth', 12);
  cylinder(b, 0.143, 0.138, 0.05, 0x2ec4b6, { y: 0.34 }, 'smooth', 12);
  torus(b, 0.07, 0.022, WHITE, { x: -0.18, y: 0.31 }, 4, 8);
};

const soda: Build = (b) => {
  cylinder(b, 0.15, 0.15, 0.44, RED, { y: 0.34 }, 'smooth', 12);
  cylinder(b, 0.13, 0.15, 0.04, SILVER, { y: 0.58 }, 'smooth', 12);
  cylinder(b, 0.15, 0.13, 0.03, SILVER, { y: 0.105 }, 'smooth', 12);
  cylinder(b, 0.153, 0.153, 0.08, WHITE, { y: 0.36 }, 'smooth', 12);
  block(b, 0.06, 0.012, 0.09, SILVER, { y: 0.605, z: 0.04 });
  block(b, 0.1, 0.1, 0.02, 0xffd23f, { y: 0.36, z: 0.155, rz: PI / 4 });
};

const smoothie: Build = (b) => {
  cylinder(b, 0.2, 0.14, 0.56, 0xffa62b, { y: 0.4 }, 'smooth', 12);
  cylinder(b, 0.182, 0.17, 0.12, 0x2ecc71, { y: 0.42 }, 'smooth', 12);
  cylinder(b, 0.215, 0.215, 0.04, WHITE, { y: 0.68 }, 'smooth', 12);
  b.add(new SphereGeometry(0.2, 12, 4, 0, PI * 2, 0, PI / 2), 0xfff4e0, 'smooth', { y: 0.69, sy: 0.5 });
  cylinder(b, 0.03, 0.03, 0.5, 0xff5a8a, { x: 0.05, y: 0.9, rz: -0.25 }, 'smooth', 6);
  block(b, 0.14, 0.1, 0.04, 0xffd23f, { x: -0.18, y: 0.7, z: 0.08, rz: 0.4 });
};

const coconut: Build = (b) => {
  // An open-topped shell, the white flesh filling the cut.
  b.add(new SphereGeometry(0.28, 10, 7, 0, PI * 2, 0.55, PI - 0.55), 0x7a4a26, 'smooth', { y: 0.42, sy: 0.92 });
  cylinder(b, 0.15, 0.15, 0.02, 0xfff8ea, { y: 0.635 }, 'smooth', 10);
  cylinder(b, 0.025, 0.025, 0.45, 0x9be564, { x: 0.06, y: 0.8, rz: -0.3 }, 'smooth', 6);
  block(b, 0.015, 0.32, 0.015, 0xe6c88a, { x: -0.08, y: 0.78, rz: 0.35 });
  cone(b, 0.15, 0.07, 0xff5a8a, { x: -0.135, y: 0.94, rz: 0.35 }, 'smooth', 8);
  cone(b, 0.09, 0.05, 0xff3d5a, { x: 0.14, y: 0.48, z: 0.2, ...aim(0.5, 0.2, 0.84) }, 'smooth', 5);
  block(b, 0.04, 0.04, 0.04, 0xffd23f, { x: 0.155, y: 0.49, z: 0.225 });
};

// ------------------------------------------------------------ props

/** A surfboard round its own centre: long axis Y, deck faces +-Z, the fin on -Z. */
const surfboardModel = (c: number): PartBuilder => {
  const b = new PartBuilder();
  orb(b, 1, c, { sx: 0.45, sy: 2.25, sz: 0.07 }, 8, 10);
  orb(b, 1, 0xffffff, { y: 1.0, sx: 0.4, sy: 0.16, sz: 0.074 }, 8, 4);
  orb(b, 1, 0xff9f1c, { y: 0.7, sx: 0.4, sy: 0.07, sz: 0.072 }, 8, 4);
  block(b, 0.03, 2.4, 0.145, 0xffffff);
  block(b, 0.04, 0.26, 0.22, 0x222831, { y: -1.75, z: -0.13 });
  return b;
};

/** A guitar: the body at the grip, the neck running up +Y, the strings facing +Z. */
const guitarModel = (c: number): PartBuilder => {
  const b = new PartBuilder();
  const dark = 0x2a1a10;
  cylinder(b, 0.48, 0.48, 0.22, c, { y: 0.3, rx: PI / 2 }, 'smooth', 14);
  cylinder(b, 0.38, 0.38, 0.22, c, { y: 0.82, rx: PI / 2 }, 'smooth', 12);
  block(b, 0.6, 0.4, 0.22, c, { y: 0.56 });
  cylinder(b, 0.13, 0.13, 0.02, dark, { y: 0.78, z: 0.11, rx: PI / 2 }, 'smooth', 10);
  block(b, 0.32, 0.07, 0.04, 0x3a2414, { y: 0.18, z: 0.12 });
  block(b, 0.16, 1.2, 0.1, 0x6a3e1e, { y: 1.65, z: 0.04 });
  block(b, 0.15, 1.3, 0.02, dark, { y: 1.57, z: 0.1 });
  block(b, 0.24, 0.34, 0.08, 0x3a2414, { y: 2.38, z: 0.04 });
  for (const x of [-0.15, 0.15]) block(b, 0.08, 0.2, 0.05, SILVER, { x, y: 2.38, z: 0.04 });
  for (const x of [-0.04, 0, 0.04]) block(b, 0.012, 2.04, 0.012, 0xeeeeee, { x, y: 1.2, z: 0.125 });
  return b;
};

const surfboard: Build = (b) => {
  b.absorb(surfboardModel(0x00bbf9), { y: 1.0, ry: PI / 2 });
};

const guitar: Build = (b) => {
  b.absorb(guitarModel(0xc8742a));
};

const camera: Build = (b) => {
  const body = 0x2a2d34;
  block(b, 0.62, 0.4, 0.3, body, { y: 0.28 });
  block(b, 0.63, 0.08, 0.31, SILVER, { y: 0.44 });
  block(b, 0.22, 0.12, 0.22, body, { y: 0.54 });
  cylinder(b, 0.16, 0.16, 0.04, SILVER, { y: 0.26, z: 0.17, rx: PI / 2 }, 'smooth', 12);
  cylinder(b, 0.15, 0.15, 0.18, 0x15161a, { y: 0.26, z: 0.22, rx: PI / 2 }, 'smooth', 12);
  cylinder(b, 0.1, 0.1, 0.01, 0x3a6aa8, { y: 0.26, z: 0.315, rx: PI / 2 }, 'glow', 10);
  block(b, 0.04, 0.04, 0.01, WHITE, { x: 0.04, y: 0.3, z: 0.322 }, 'glow');
  block(b, 0.14, 0.08, 0.04, WHITE, { x: -0.2, y: 0.4, z: 0.15 }, 'glow');
  cylinder(b, 0.05, 0.05, 0.05, RED, { x: 0.2, y: 0.5 }, 'smooth', 8);
  block(b, 0.12, 0.34, 0.06, 0x111111, { x: 0.25, y: 0.26, z: 0.16 });
  block(b, 0.16, 0.1, 0.02, 0x7ad3ff, { x: -0.18, y: 0.3, z: -0.155 }, 'glow');
};

const bouquet: Build = (b) => {
  cone(b, 0.3, 0.7, 0xff9ec4, { y: 0.25, rz: PI }, 'smooth', 8);
  cylinder(b, 0.12, 0.09, 0.08, RED, { y: 0.12 }, 'smooth', 8);
  for (const s of [-1, 1]) block(b, 0.14, 0.08, 0.04, RED, { x: s * 0.1, y: 0.12, z: 0.12, rz: s * 0.5 });
  const flowers: readonly (readonly [number, number, number, number])[] = [
    [0, 0.78, 0, 0xe0263d],
    [0.17, 0.66, 0.06, 0xffd23f],
    [-0.17, 0.66, 0.06, WHITE],
    [0.07, 0.68, -0.16, 0xff5a8a],
    [-0.06, 0.66, 0.18, 0xff9f1c],
  ];
  for (const [x, y, z, color] of flowers) orb(b, 0.14, color, { x, y, z }, 6, 4);
  for (const [x, z, rz] of [[0.26, 0, -0.6], [-0.26, 0.05, 0.6], [0.02, -0.25, 0.1]] as const) {
    block(b, 0.1, 0.28, 0.03, 0x4cb83a, { x, y: 0.62, z, rz, ry: Math.atan2(x, z) }, 'leaf');
  }
};

const balloon: Build = (b) => {
  const c = 0xff3d5a;
  block(b, 0.02, 1.4, 0.02, 0xf2f2f2, { x: -0.021, y: 0.7, rz: 0.03 });
  block(b, 0.02, 1.26, 0.02, 0xf2f2f2, { x: -0.017, y: 2.025, rz: -0.04 });
  cone(b, 0.07, 0.1, c, { y: 2.66 }, 'smooth', 6);
  orb(b, 0.45, c, { y: 3.12, sy: 1.15 }, 10, 8);
  orb(b, 0.08, WHITE, { x: -0.18, y: 3.35, z: 0.33, sy: 1.4 }, 6, 4, 'glow');
};

const umbrella: Build = (b) => {
  const c = 0xff5a8a;
  cylinder(b, 0.035, 0.035, 2.9, 0xdedede, { y: 1.15 }, 'smooth', 6);
  cylinder(b, 0.05, 0.05, 0.36, 0x6a3e1e, { y: -0.12 }, 'smooth', 6);
  torus(b, 0.12, 0.04, 0x6a3e1e, { x: 0.12, y: -0.3, rz: PI }, 4, 8, PI);
  // Eight panels, alternating colours, seen from above and below.
  for (let i = 0; i < 8; i += 1) {
    const color = i % 2 ? WHITE : c;
    twoSided(b, new ConeGeometry(1.5, 0.55, 2, 1, true, (i * PI) / 4, PI / 4), color, { y: 2.35 });
    const a = (i * PI) / 4;
    block(b, 0.07, 0.07, 0.07, color, { x: 1.5 * Math.sin(a), y: 2.06, z: 1.5 * Math.cos(a) });
  }
  cylinder(b, 0.03, 0.05, 0.16, 0xdedede, { y: 2.68 }, 'smooth', 6);
};

const boombox: Build = (b) => {
  const body = 0x3a3f4a;
  block(b, 1.1, 0.6, 0.32, body, { y: -0.42 });
  block(b, 0.6, 0.06, 0.08, SILVER, { y: 0 });
  for (const s of [-1, 1]) {
    block(b, 0.06, 0.14, 0.08, SILVER, { x: s * 0.27, y: -0.07 });
    cylinder(b, 0.2, 0.2, 0.04, 0x15161a, { x: s * 0.32, y: -0.44, z: 0.17, rx: PI / 2 }, 'smooth', 10);
    cylinder(b, 0.08, 0.08, 0.05, SILVER, { x: s * 0.32, y: -0.44, z: 0.18, rx: PI / 2 }, 'smooth', 6);
  }
  block(b, 0.28, 0.12, 0.02, 0x2ec4b6, { y: -0.27, z: 0.165 }, 'glow');
  block(b, 0.26, 0.18, 0.02, 0x15161a, { y: -0.5, z: 0.165 });
  [0xff3d5a, 0xffd23f, 0x2ecc71].forEach((color, i) => block(b, 0.08, 0.04, 0.08, color, { x: -0.15 + i * 0.15, y: -0.1 }));
  block(b, 0.02, 0.5, 0.02, SILVER, { x: 0.46, y: 0.05, rz: -0.35 });
  block(b, 0.9, 0.06, 0.02, 0xff3d7f, { y: -0.68, z: -0.165 });
};

const briefcase: Build = (b) => {
  const leather = 0x5a3a22;
  block(b, 0.9, 0.62, 0.22, leather, { y: -0.42 });
  block(b, 0.92, 0.03, 0.23, shade(leather, 0.7), { y: -0.2 });
  block(b, 0.3, 0.05, 0.06, 0x2a1a10, { y: 0 });
  for (const s of [-1, 1]) {
    block(b, 0.05, 0.1, 0.06, 0x2a1a10, { x: s * 0.14, y: -0.06 });
    block(b, 0.08, 0.06, 0.03, GOLD, { x: s * 0.28, y: -0.2, z: 0.12 });
  }
  block(b, 0.16, 0.08, 0.01, GOLD, { y: -0.4, z: 0.115 });
};

const beachball: Build = (b) => {
  const colors = [0xff3d3d, WHITE, 0x3a86ff, 0xffd23f, WHITE, 0x2ecc71];
  colors.forEach((color, i) => {
    b.add(new SphereGeometry(0.45, 3, 4, (i * PI) / 3, PI / 3, 0.25, PI - 0.5), color, 'smooth', { y: 0.55 });
  });
  for (const flip of [0, PI]) b.add(new SphereGeometry(0.452, 18, 1, 0, PI * 2, 0, 0.26), WHITE, 'smooth', { y: 0.55, rx: flip });
};

const fishingRod: Build = (b) => {
  const t = 0.35;
  const d = { y: Math.cos(t), z: Math.sin(t) };
  const n = { y: -Math.sin(t), z: Math.cos(t) };
  const along = (s: number, off = 0): Transform => ({ y: d.y * s + n.y * off, z: d.z * s + n.z * off, rx: t });
  cylinder(b, 0.022, 0.045, 3.4, 0x2a2d34, along(1.3), 'smooth', 6);
  cylinder(b, 0.065, 0.065, 0.6, 0xc89a5a, along(0), 'smooth', 8);
  cylinder(b, 0.11, 0.11, 0.08, SILVER, { ...along(0.45, 0.14), rz: PI / 2 }, 'smooth', 10);
  block(b, 0.03, 0.12, 0.03, 0x2a2d34, along(0.45, 0.06));
  block(b, 0.1, 0.02, 0.02, DARK, { ...along(0.45, 0.14), x: 0.08 });
  for (const s of [1.2, 2.0, 2.7]) block(b, 0.02, 0.02, 0.08, SILVER, along(s, 0.05));
  const tip = { y: d.y * 3.0, z: d.z * 3.0 };
  block(b, 0.012, 1.6, 0.012, 0xf0f0f0, { y: tip.y - 0.8, z: tip.z });
  orb(b, 0.08, RED, { y: tip.y - 1.6, z: tip.z, sy: 1.2 }, 6, 4);
  orb(b, 0.06, WHITE, { y: tip.y - 1.7, z: tip.z }, 6, 4);
};

const sign: Build = (b) => {
  block(b, 0.08, 2.0, 0.08, 0xc89a5a, { y: 0.7 });
  block(b, 1.4, 0.9, 0.06, 0xfff4e0, { y: 1.9 });
  for (const y of [1.45, 2.35]) block(b, 1.44, 0.06, 0.08, RED, { y });
  for (const x of [-0.7, 0.7]) block(b, 0.06, 0.96, 0.08, RED, { x, y: 1.9 });
  for (const z of [-0.035, 0.035]) {
    block(b, 1.0, 0.13, 0.01, RED, { y: 2.12, z });
    block(b, 0.8, 0.11, 0.01, DARK, { x: -0.1, y: 1.9, z });
    block(b, 0.9, 0.11, 0.01, DARK, { x: 0.05, y: 1.68, z });
  }
};

const parcel: Build = (b) => {
  block(b, 0.62, 0.48, 0.5, 0xc8955a, { y: 0.36 });
  block(b, 0.12, 0.5, 0.52, 0xe8d8a8, { y: 0.36 });
  block(b, 0.22, 0.14, 0.01, WHITE, { x: 0.18, y: 0.3, z: 0.255 });
  for (let i = 0; i < 4; i += 1) block(b, 0.015, 0.08, 0.005, DARK, { x: 0.12 + i * 0.035, y: 0.29, z: 0.262 });
  block(b, 0.12, 0.12, 0.01, 0xffb547, { x: -0.2, y: 0.46, z: 0.255 });
  block(b, 0.24, 0.07, 0.01, RED, { x: -0.18, y: 0.24, z: 0.255 });
};

const medkit: Build = (b) => {
  block(b, 0.7, 0.5, 0.26, WHITE, { y: -0.36 });
  block(b, 0.72, 0.05, 0.27, RED, { y: -0.17 });
  for (const z of [-0.135, 0.135]) {
    block(b, 0.24, 0.08, 0.02, RED, { y: -0.38, z });
    block(b, 0.08, 0.24, 0.02, RED, { y: -0.38, z });
  }
  block(b, 0.3, 0.05, 0.06, 0x3a3f4a, { y: 0 });
  for (const s of [-1, 1]) block(b, 0.05, 0.11, 0.06, 0x3a3f4a, { x: s * 0.14, y: -0.06 });
};

const tray: Build = (b) => {
  block(b, 1.0, 0.06, 0.7, 0xc0392b, { y: 0.06, z: 0.15 });
  block(b, 0.9, 0.061, 0.6, 0xe8604a, { y: 0.065, z: 0.15 });
  // A mini meal: burger, fries, a drink with a straw.
  const bun = 0xe0a050;
  cylinder(b, 0.14, 0.13, 0.06, bun, { x: -0.25, y: 0.13, z: 0.18 }, 'smooth', 8);
  cylinder(b, 0.15, 0.15, 0.05, 0x6a3a1e, { x: -0.25, y: 0.185, z: 0.18 }, 'smooth', 8);
  cylinder(b, 0.08, 0.14, 0.08, bun, { x: -0.25, y: 0.25, z: 0.18 }, 'smooth', 8);
  cylinder(b, 0.13, 0.1, 0.2, 0xe8322e, { x: 0.05, y: 0.19, z: 0.3, ry: PI / 4 }, 'smooth', 4);
  for (const [x, z] of [[0.02, 0.28], [0.07, 0.32], [0.05, 0.26], [0.09, 0.29]] as const) {
    block(b, 0.035, 0.18, 0.035, 0xffcf4a, { x, y: 0.3, z, rz: (x - 0.05) * 6 });
  }
  cylinder(b, 0.11, 0.09, 0.3, 0x2ec4b6, { x: 0.3, y: 0.24, z: 0.05 }, 'smooth', 8);
  cylinder(b, 0.115, 0.115, 0.03, WHITE, { x: 0.3, y: 0.4, z: 0.05 }, 'smooth', 8);
  cylinder(b, 0.02, 0.02, 0.24, 0xff5a8a, { x: 0.32, y: 0.5, z: 0.05, rz: -0.2 }, 'smooth', 6);
  block(b, 0.16, 0.01, 0.16, WHITE, { x: 0.28, y: 0.1, z: 0.36, ry: 0.3 });
};

const ITEM_BUILDERS: Readonly<Record<string, Build>> = {
  burger,
  fries,
  hotdog,
  pizza,
  taco,
  donut,
  croissant,
  sandwich,
  icecream,
  watermelon,
  coffee,
  soda,
  smoothie,
  coconut,
  surfboard,
  guitar,
  camera,
  bouquet,
  balloon,
  umbrella,
  boombox,
  briefcase,
  beachball,
  fishing_rod: fishingRod,
  sign,
  parcel,
  medkit,
  tray,
};

/**
 * A held item, in the RIGHT HAND's mount frame: the grip is the origin, +Y
 * runs along the item's long axis out of the fist (up/forward), +Z is the
 * item's front/edge. An unknown key builds nothing (check `b.isEmpty`).
 */
export const buildItem = (b: PartBuilder, key: string): void => {
  ITEM_BUILDERS[key]?.(b);
};

// ------------------------------------------------------------ hats (head frame)

/** A baseball cap: a block band, a low crown, the peak forward. */
const capBase = (b: PartBuilder, c: number, peak = shade(c, 0.8)): void => {
  block(b, 1.06, 0.26, 1.06, c, { y: 0.43 });
  b.add(new SphereGeometry(0.6, 12, 5, 0, PI * 2, 0, PI / 2), c, 'smooth', { y: 0.54, sx: 0.88, sy: 0.55, sz: 0.88 });
  block(b, 0.94, 0.05, 0.52, peak, { y: 0.34, z: 0.74, rx: 0.12 });
  cylinder(b, 0.06, 0.06, 0.04, peak, { y: 0.87 }, 'smooth', 8);
};

const cap: BuildColored = (b, c) => {
  capBase(b, c);
  block(b, 0.24, 0.14, 0.02, WHITE, { y: 0.44, z: 0.535 });
  block(b, 0.1, 0.06, 0.022, c, { y: 0.44, z: 0.537 });
};

const sunhat: BuildColored = (b, c) => {
  cylinder(b, 1.1, 1.1, 0.06, c, { y: 0.48 }, 'smooth', 16);
  cylinder(b, 0.56, 0.6, 0.36, c, { y: 0.68 }, 'smooth', 14);
  cylinder(b, 0.61, 0.61, 0.1, 0xff70a6, { y: 0.56 }, 'smooth', 14);
  orb(b, 0.13, 0xff3d7f, { x: 0.5, y: 0.66, z: 0.32 }, 6, 4);
  orb(b, 0.06, 0xffd23f, { x: 0.56, y: 0.7, z: 0.38 }, 6, 4);
  block(b, 0.22, 0.03, 0.1, 0x4cb83a, { x: 0.62, y: 0.6, z: 0.18, ry: 0.6 }, 'leaf');
};

const bucketHat: BuildColored = (b, c) => {
  cylinder(b, 0.5, 0.58, 0.38, c, { y: 0.7 }, 'smooth', 12);
  cylinder(b, 0.62, 0.84, 0.14, shade(c, 0.92), { y: 0.45 }, 'smooth', 12);
  cylinder(b, 0.585, 0.59, 0.08, shade(c, 0.7), { y: 0.55 }, 'smooth', 12);
  for (let i = 0; i < 4; i += 1) {
    const a = (i * PI) / 2 + PI / 4;
    block(b, 0.06, 0.06, 0.02, shade(c, 0.6), { x: 0.53 * Math.sin(a), y: 0.76, z: 0.53 * Math.cos(a), ry: a });
  }
};

const beanie: BuildColored = (b, c) => {
  block(b, 1.08, 0.24, 1.08, shade(c, 0.82), { y: 0.38 });
  block(b, 1.04, 0.16, 1.04, c, { y: 0.56 });
  b.add(new SphereGeometry(0.56, 12, 5, 0, PI * 2, 0, PI / 2), c, 'smooth', { y: 0.62, sx: 0.95, sy: 0.6, sz: 0.95 });
  orb(b, 0.17, 0xfff4e0, { y: 0.98 }, 8, 6);
  for (let i = 0; i < 5; i += 1) block(b, 0.04, 0.22, 0.02, shade(c, 0.66), { x: -0.4 + i * 0.2, y: 0.38, z: 0.545 });
};

const cowboy: BuildColored = (b, c) => {
  cylinder(b, 0.95, 0.95, 0.06, c, { y: 0.47, sz: 0.82 }, 'smooth', 14);
  for (const s of [-1, 1]) block(b, 0.36, 0.06, 1.0, c, { x: s * 0.98, y: 0.58, rz: s * 0.6 });
  cylinder(b, 0.48, 0.56, 0.5, c, { y: 0.75, sz: 0.9 }, 'smooth', 10);
  block(b, 0.16, 0.08, 0.7, shade(c, 0.75), { y: 1.0 });
  cylinder(b, 0.57, 0.57, 0.1, 0x3a2414, { y: 0.56, sz: 0.9 }, 'smooth', 10);
  block(b, 0.12, 0.1, 0.03, SILVER, { y: 0.56, z: 0.52 });
};

const fedora: BuildColored = (b, c) => {
  cylinder(b, 0.82, 0.82, 0.05, c, { y: 0.47 }, 'smooth', 14);
  cylinder(b, 0.5, 0.56, 0.42, c, { y: 0.7, sz: 0.9 }, 'smooth', 12);
  block(b, 0.14, 0.08, 0.6, shade(c, 0.8), { y: 0.9 });
  cylinder(b, 0.57, 0.57, 0.12, 0x222831, { y: 0.55, sz: 0.9 }, 'smooth', 12);
  block(b, 0.04, 0.16, 0.12, 0xff9f1c, { x: 0.55, y: 0.58, z: 0.1 });
};

const headphones: BuildColored = (b, c) => {
  torus(b, 0.62, 0.07, c, { y: 0.02 }, 4, 10, PI);
  block(b, 0.5, 0.06, 0.2, 0x3a3f4a, { y: 0.66 });
  for (const s of [-1, 1]) {
    cylinder(b, 0.26, 0.26, 0.18, c, { x: s * 0.62, y: -0.02, rz: PI / 2 }, 'smooth', 12);
    cylinder(b, 0.22, 0.22, 0.06, 0x3a3f4a, { x: s * 0.52, y: -0.02, rz: PI / 2 }, 'smooth', 8);
    cylinder(b, 0.13, 0.13, 0.02, 0x2ec4b6, { x: s * 0.715, y: -0.02, rz: PI / 2 }, 'glow', 6);
  }
};

const flowerCrown: BuildColored = (b, c) => {
  const vine = 0x3a8a3a;
  for (const z of [-0.56, 0.56]) block(b, 1.12, 0.07, 0.07, vine, { y: 0.5, z });
  for (const x of [-0.56, 0.56]) block(b, 0.07, 0.07, 1.12, vine, { x, y: 0.5 });
  const colors = [c, WHITE, 0xffd23f, c, 0xb388ff, WHITE, 0xffd23f, 0xff9f1c];
  for (let i = 0; i < 8; i += 1) {
    const a = (i * PI) / 4;
    const r = i % 2 ? 0.8 : 0.58;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    cone(b, 0.13, 0.08, colors[i]!, { x, y: 0.53, z, rx: PI / 2 - 0.25, ry: a }, 'smooth', 5);
    block(b, 0.07, 0.07, 0.07, i % 2 ? 0xffd23f : 0xff9f1c, { x: x * 1.08, y: 0.55, z: z * 1.08, ry: a });
  }
  for (let i = 0; i < 4; i += 1) {
    const a = (i * PI) / 2 + PI / 8;
    block(b, 0.16, 0.03, 0.08, 0x4cb83a, { x: Math.sin(a) * 0.62, y: 0.54, z: Math.cos(a) * 0.62, ry: a + 0.4 }, 'leaf');
  }
};

const crown: BuildColored = (b, c) => {
  const gems = [0xe0263d, 0x3a86ff, 0x2ecc71, 0xb04aff];
  b.add(new SphereGeometry(0.38, 10, 4, 0, PI * 2, 0, PI / 2), 0xc0182a, 'smooth', { y: 0.62, sy: 0.6 });
  cylinder(b, 0.42, 0.4, 0.22, c, { y: 0.6 }, 'smooth', 12);
  cylinder(b, 0.45, 0.45, 0.05, shade(c, 0.82), { y: 0.5 }, 'smooth', 12);
  for (let i = 0; i < 8; i += 1) {
    const a = (i * PI) / 4;
    const x = Math.sin(a) * 0.4;
    const z = Math.cos(a) * 0.4;
    cone(b, 0.09, 0.24, c, { x, y: 0.82, z, ry: a + PI / 4 }, 'smooth', 4);
    orb(b, 0.05, WHITE, { x, y: 0.95, z }, 5, 3);
  }
  gems.forEach((color, i) => {
    const a = (i * PI) / 2;
    block(b, 0.11, 0.11, 0.04, color, { x: Math.sin(a) * 0.42, y: 0.6, z: Math.cos(a) * 0.42, ry: a, rz: PI / 4 }, 'glow');
  });
  orb(b, 0.08, c, { y: 1.0 }, 6, 4);
  block(b, 0.04, 0.16, 0.04, c, { y: 1.12 });
  block(b, 0.12, 0.04, 0.04, c, { y: 1.13 });
};

const policeCap: BuildColored = (b, c) => {
  cylinder(b, 0.58, 0.56, 0.24, c, { y: 0.46 }, 'smooth', 12);
  cylinder(b, 0.74, 0.6, 0.16, c, { y: 0.66 }, 'smooth', 12);
  cylinder(b, 0.575, 0.565, 0.07, 0x111111, { y: 0.39 }, 'smooth', 12);
  b.add(new CylinderGeometry(0.52, 0.52, 0.05, 10, 1, false, -PI / 2, PI), 0x111111, 'smooth', { y: 0.37, z: 0.3, rx: 0.15 });
  block(b, 0.7, 0.03, 0.03, GOLD, { y: 0.43, z: 0.585 });
  block(b, 0.18, 0.2, 0.04, GOLD, { y: 0.53, z: 0.58 });
  block(b, 0.08, 0.08, 0.01, 0xfff3b0, { y: 0.53, z: 0.603, rz: PI / 4 }, 'glow');
};

const medicCap: BuildColored = (b, c) => {
  capBase(b, c, shade(c, 0.9));
  block(b, 0.22, 0.07, 0.02, RED, { y: 0.43, z: 0.537 });
  block(b, 0.07, 0.22, 0.02, RED, { y: 0.43, z: 0.537 });
  cylinder(b, 0.065, 0.065, 0.045, RED, { y: 0.875 }, 'smooth', 8);
};

const deliveryCap: BuildColored = (b, c) => {
  capBase(b, c, 0x6a4020);
  block(b, 0.2, 0.15, 0.02, 0x6a4020, { y: 0.44, z: 0.537 });
  block(b, 0.2, 0.03, 0.022, 0xe8d8a8, { y: 0.47, z: 0.538 });
};

const taxiCap: BuildColored = (b, c) => {
  capBase(b, c, 0x111111);
  for (let i = 0; i < 5; i += 1) {
    for (let j = 0; j < 2; j += 1) {
      block(b, 0.1, 0.08, 0.02, (i + j) % 2 ? WHITE : 0x111111, { x: -0.2 + i * 0.1, y: 0.4 + j * 0.08, z: 0.537 });
    }
  }
};

const chefHat: BuildColored = (b, c) => {
  cylinder(b, 0.56, 0.54, 0.32, c, { y: 0.6 }, 'smooth', 12);
  orb(b, 0.44, c, { y: 1.05 }, 8, 6);
  for (let i = 0; i < 4; i += 1) {
    const a = (i * PI) / 2 + PI / 4;
    orb(b, 0.3, shade(c, 0.95), { x: Math.sin(a) * 0.3, y: 0.92, z: Math.cos(a) * 0.3 }, 6, 4);
  }
};

const visor: BuildColored = (b, c) => {
  for (const z of [-0.52, 0.52]) block(b, 1.08, 0.2, 0.04, c, { y: 0.42, z });
  for (const x of [-0.52, 0.52]) block(b, 0.04, 0.2, 1.08, c, { x, y: 0.42 });
  block(b, 0.96, 0.05, 0.52, shade(c, 0.85), { y: 0.34, z: 0.76, rx: 0.12 });
  block(b, 0.2, 0.1, 0.02, WHITE, { y: 0.43, z: 0.545 });
};

// ------------------------------------------------------------ face (head frame)

const sunglasses: BuildColored = (b, c) => {
  for (const s of [-1, 1]) {
    block(b, 0.36, 0.22, 0.05, c, { x: s * 0.22, y: 0.1, z: 0.53 });
    block(b, 0.09, 0.035, 0.01, WHITE, { x: s * 0.22 - 0.08, y: 0.15, z: 0.556, rz: 0.6 }, 'glow');
    block(b, 0.05, 0.05, 0.55, c, { x: s * 0.505, y: 0.17, z: 0.27 });
  }
  block(b, 0.98, 0.07, 0.07, c, { y: 0.22, z: 0.53 });
  block(b, 0.1, 0.05, 0.05, c, { y: 0.14, z: 0.53 });
};

const aviators: BuildColored = (b, c) => {
  for (const s of [-1, 1]) {
    cylinder(b, 0.19, 0.19, 0.02, c, { x: s * 0.22, y: 0.07, z: 0.525, rx: PI / 2, sz: 0.85 }, 'smooth', 10);
    cylinder(b, 0.17, 0.17, 0.03, 0x2f3b33, { x: s * 0.22, y: 0.07, z: 0.535, rx: PI / 2, sz: 0.85 }, 'smooth', 10);
    block(b, 0.08, 0.03, 0.01, WHITE, { x: s * 0.22 - 0.07, y: 0.13, z: 0.552, rz: 0.5 }, 'glow');
    block(b, 0.035, 0.035, 0.55, c, { x: s * 0.5, y: 0.17, z: 0.27 });
  }
  block(b, 0.9, 0.03, 0.03, c, { y: 0.21, z: 0.535 });
  block(b, 0.12, 0.025, 0.03, c, { y: 0.13, z: 0.535 });
};

const heartGlasses: BuildColored = (b, c) => {
  for (const s of [-1, 1]) {
    const cx = s * 0.24;
    const cy = 0.08;
    for (const dx of [-0.075, 0.075]) cylinder(b, 0.1, 0.1, 0.04, c, { x: cx + dx, y: cy + 0.04, z: 0.535, rx: PI / 2 }, 'smooth', 10);
    block(b, 0.19, 0.19, 0.04, c, { x: cx, y: cy - 0.03, z: 0.535, rz: PI / 4 });
    block(b, 0.06, 0.03, 0.01, WHITE, { x: cx - 0.09, y: cy + 0.09, z: 0.557, rz: 0.6 }, 'glow');
    block(b, 0.035, 0.035, 0.55, shade(c, 0.75), { x: s * 0.5, y: 0.16, z: 0.27 });
  }
  block(b, 0.12, 0.04, 0.04, shade(c, 0.75), { y: 0.13, z: 0.53 });
};

const mustache: BuildColored = (b, c) => {
  block(b, 0.16, 0.1, 0.08, c, { y: -0.1, z: 0.53 });
  for (const s of [-1, 1]) {
    block(b, 0.24, 0.11, 0.08, c, { x: s * 0.16, y: -0.13, z: 0.53, rz: -s * 0.3 });
    block(b, 0.08, 0.13, 0.07, c, { x: s * 0.3, y: -0.12, z: 0.53, rz: -s * 0.5 });
  }
};

// ------------------------------------------------------------ back (back frame, world units)

const backpack: BuildColored = (b, c) => {
  const dark = shade(c, 0.6);
  block(b, 1.1, 1.2, 0.5, c, { y: -0.3, z: -0.27 });
  cylinder(b, 0.25, 0.25, 1.1, c, { y: 0.3, z: -0.27, rz: PI / 2 }, 'smooth', 10);
  block(b, 0.8, 0.5, 0.16, shade(c, 0.82), { y: -0.55, z: -0.58 });
  block(b, 0.82, 0.12, 0.18, shade(c, 0.7), { y: -0.31, z: -0.59 });
  block(b, 0.04, 0.04, 0.53, 0xffd23f, { x: 0.5, y: 0.3, z: -0.27 });
  block(b, 0.14, 0.14, 0.02, 0xffd23f, { y: -0.58, z: -0.665, rz: PI / 4 });
  for (const s of [-1, 1]) block(b, 0.06, 0.9, 0.14, dark, { x: s * 0.56, y: -0.3, z: -0.2 });
  block(b, 0.3, 0.06, 0.08, dark, { y: 0.58, z: -0.27 });
};

const surfBack: BuildColored = (b, c) => {
  b.absorb(surfboardModel(c), { y: -0.1, z: -0.14, rz: 0.35, sx: 0.75, sy: 0.75, sz: 0.75 });
  block(b, 1.1, 0.08, 0.04, 0x222831, { y: 0.15, z: -0.03, rz: -0.5 });
};

const guitarBack: BuildColored = (b, c) => {
  b.absorb(guitarModel(c), { x: -0.25, y: -0.9, z: -0.16, ry: PI, rz: 0.35 });
};

const wings: BuildColored = (b, c) => {
  const layers: readonly { z: number; scale: number; color: number; count: number }[] = [
    { z: -0.3, scale: 1, color: c, count: 6 },
    { z: -0.26, scale: 0.65, color: shade(c, 0.94), count: 5 },
    { z: -0.22, scale: 0.38, color: shade(c, 0.88), count: 4 },
  ];
  const sweep = 0.35;
  for (const s of [-1, 1]) {
    orb(b, 0.14, c, { x: s * 0.25, y: 0.15, z: -0.22 }, 6, 4);
    for (const layer of layers) {
      for (let i = 0; i < layer.count; i += 1) {
        const k = layer.count === 1 ? 0 : i / (layer.count - 1);
        const theta = 0.65 - k * 1.75;
        const len = (1.5 - k * 0.85) * layer.scale + 0.15;
        const dx = s * Math.cos(theta) * Math.cos(sweep);
        const dz = -Math.cos(theta) * Math.sin(sweep);
        block(b, len, 0.2, 0.05, layer.color, {
          x: s * 0.25 + dx * (len / 2),
          y: 0.15 + Math.sin(theta) * (len / 2),
          z: layer.z + dz * (len / 2),
          rz: s * theta,
          ry: s * sweep,
        }, 'leaf');
      }
    }
  }
};

const lei: BuildColored = (b, c) => {
  const colors = [c, 0xffd23f, WHITE, c, 0xff9f1c, 0xb388ff];
  const count = 16;
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * PI * 2;
    // An oval round the neck, higher at the back, draping onto the chest in front.
    const x = 0.55 * Math.sin(a);
    const z = 0.28 - 0.33 * Math.cos(a);
    const y = 0.15 + 0.13 * Math.cos(a);
    const ox = Math.sin(a) / 0.55;
    const oz = -Math.cos(a) / 0.33;
    const flat = Math.hypot(ox, oz) || 1;
    const dir = aim(ox / flat, 1, oz / flat);
    cone(b, 0.11, 0.07, colors[i % colors.length]!, { x, y, z, ...dir }, 'smooth', 5);
    block(b, 0.05, 0.05, 0.05, 0xffe066, { x: x + (ox / flat) * 0.03, y: y + 0.04, z: z + (oz / flat) * 0.03 });
    // A leaf between each pair of flowers, laid along the string.
    const m = a + PI / count;
    block(b, 0.12, 0.02, 0.06, 0x3a9a3a, {
      x: 0.55 * Math.sin(m),
      y: 0.13 + 0.13 * Math.cos(m),
      z: 0.28 - 0.33 * Math.cos(m),
      ry: Math.atan2(-0.33 * Math.sin(m), 0.55 * Math.cos(m)),
    }, 'leaf');
  }
};

const ACCESSORY_BUILDERS: Readonly<Record<string, BuildColored>> = {
  sunhat,
  bucket_hat: bucketHat,
  beanie,
  cowboy,
  fedora,
  headphones,
  flower_crown: flowerCrown,
  crown,
  sunglasses,
  aviators,
  heart_glasses: heartGlasses,
  mustache,
  backpack,
  surf_back: surfBack,
  guitar_back: guitarBack,
  wings,
  lei,
  police_cap: policeCap,
  medic_cap: medicCap,
  delivery_cap: deliveryCap,
  taxi_cap: taxiCap,
  chef_hat: chefHat,
  visor,
};

/**
 * A worn accessory, in its slot's frame: hats and face items in the HEAD
 * frame (unit cube, face +Z, top y = 0.5; the caller scales by the head
 * size), back items in the BACK frame in world units (-Z behind the
 * character). Every `cap_*` key is a baseball cap in its colour. An unknown
 * key builds nothing.
 */
export const buildAccessory = (b: PartBuilder, key: string): void => {
  const color = ACCESSORIES.find((a) => a.key === key)?.color ?? WHITE;
  const build = ACCESSORY_BUILDERS[key] ?? (key.startsWith('cap') ? cap : undefined);
  build?.(b, color);
};
