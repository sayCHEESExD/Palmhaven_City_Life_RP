import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { PartBuilder, type PartKind, type Transform } from '../render/PartBuilder.js';
import { hue, shade } from './shapes.js';

/**
 * PALMHAVEN PROPS: procedural models for every entry in the shared prop
 * catalogue (furniture, shop fittings, street furniture, beach and playground
 * gear) plus the city's instanced scenery (palms, trees, street lamps, signal
 * masts) and its static landmarks (gas canopy, flags, lighthouse lantern,
 * welcome sign, giant letters, Ferris wheel).
 *
 * Every prop is built at the origin, base on y = 0, facing local +Z, filling
 * its PropDef footprint (w along X, d along Z, h up). Chunky low-poly plastic
 * with small premium details, kept inside per-model triangle budgets because
 * the city merges and instances these by the hundred.
 */

type B = PartBuilder;
type V3 = readonly [number, number, number];
type Builder = (b: B) => void;

// ----------------------------------------------------------------- palette

const C = {
  white: 0xf7f7f2,
  cream: 0xfff1d6,
  sand: 0xf0d9a8,
  coral: 0xff7b6b,
  salmon: 0xff9e80,
  pink: 0xff8fb8,
  flamingo: 0xff6f9f,
  peach: 0xffc49b,
  teal: 0x22b3a6,
  aqua: 0x6fd8d0,
  mint: 0x9fe3c4,
  sky: 0x86ccf5,
  lilac: 0xbca7e8,
  lemon: 0xffe27a,
  sunny: 0xffc94a,
  orange: 0xff9a3c,
  palm: 0x3f9f4f,
  leaf: 0x5cbf5f,
  deepLeaf: 0x2f7d45,
  wood: 0xb5835a,
  lightWood: 0xddb07a,
  darkWood: 0x7b5034,
  bark: 0x9c7a55,
  steel: 0xb9c3cc,
  chrome: 0xdfe6ec,
  metal: 0x7d8792,
  charcoal: 0x353b45,
  ink: 0x1f232b,
  black: 0x16191f,
  red: 0xe5484d,
  navy: 0x2b4a7a,
  glass: 0xbfe8f7,
  screen: 0x1a3f7a,
  terracotta: 0xd9774a,
  stone: 0xe8e0d0,
  water: 0x7fdcef,
  warm: 0xfff3c9,
} as const;

// ----------------------------------------------------------------- helpers

/** A box by its centre. */
const box = (b: B, w: number, h: number, d: number, c: number, x: number, y: number, z: number, kind: PartKind = 'smooth', r: Transform = {}): void => {
  b.add(new BoxGeometry(w, h, d), c, kind, { x, y, z, ...r });
};

/** A box standing on `y0`. */
const blk = (b: B, w: number, h: number, d: number, c: number, x: number, y0: number, z: number, kind: PartKind = 'smooth', r: Transform = {}): void => {
  box(b, w, h, d, c, x, y0 + h / 2, z, kind, r);
};

/** A vertical cylinder standing on `y0`. */
const cyl = (b: B, rTop: number, rBot: number, h: number, c: number, x: number, y0: number, z: number, seg = 8, kind: PartKind = 'smooth', open = false, r: Transform = {}): void => {
  b.add(new CylinderGeometry(rTop, rBot, h, seg, 1, open), c, kind, { x, y: y0 + h / 2, z, ...r });
};

/** A cylinder from point `a` to point `e` (radius `r` at a, `rEnd` at e). */
const rod = (b: B, a: V3, e: V3, r: number, c: number, seg = 6, kind: PartKind = 'smooth', rEnd = r, open = false): void => {
  const dx = e[0] - a[0];
  const dy = e[1] - a[1];
  const dz = e[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return;
  const rx = Math.acos(Math.max(-1, Math.min(1, dy / len)));
  const ry = Math.atan2(dx, dz);
  b.add(new CylinderGeometry(rEnd, r, len, seg, 1, open), c, kind, { x: (a[0] + e[0]) / 2, y: (a[1] + e[1]) / 2, z: (a[2] + e[2]) / 2, rx, ry });
};

/** A box stretched from point `a` to point `e` (a beam, a slat, a stroke). `w` across, `t` thick. */
const beam = (b: B, a: V3, e: V3, w: number, t: number, c: number, kind: PartKind = 'smooth', extend = 0): void => {
  const dx = e[0] - a[0];
  const dy = e[1] - a[1];
  const dz = e[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return;
  const rx = -Math.asin(Math.max(-1, Math.min(1, dy / len)));
  const ry = Math.atan2(dx, dz);
  box(b, w, t, len + extend, c, (a[0] + e[0]) / 2, (a[1] + e[1]) / 2, (a[2] + e[2]) / 2, kind, { rx, ry });
};

/** A low-poly sphere (6 x 4 = 36 triangles by default). */
const orb = (b: B, r: number, c: number, x: number, y: number, z: number, seg = 6, kind: PartKind = 'smooth', s: V3 = [1, 1, 1]): void => {
  b.add(new SphereGeometry(r, seg, Math.max(3, Math.round(seg * 0.66))), c, kind, { x, y, z, sx: s[0], sy: s[1], sz: s[2] });
};

/** A 20-triangle faceted blob (foliage, rocks, pastries). */
const gem = (b: B, r: number, c: number, x: number, y: number, z: number, kind: PartKind = 'flat', s: V3 = [1, 1, 1], ry = 0): void => {
  b.add(new IcosahedronGeometry(r, 0), c, kind, { x, y, z, sx: s[0], sy: s[1], sz: s[2], ry });
};

/** A torus (life ring, hoop rim, rope coil); lies in its local XY plane. */
const ring = (b: B, rad: number, tube: number, c: number, t: Transform, kind: PartKind = 'smooth', tubular = 10, radial = 4): void => {
  b.add(new TorusGeometry(rad, tube, radial, tubular), c, kind, t);
};

/** A cone standing on `y0`. */
const spike = (b: B, r: number, h: number, c: number, x: number, y0: number, z: number, seg = 8, kind: PartKind = 'smooth', open = false, t: Transform = {}): void => {
  b.add(new ConeGeometry(r, h, seg, 1, open), c, kind, { x, y: y0 + h / 2, z, ...t });
};

/** A disc lying flat (a plate, a burner, a lens on the floor). */
const disc = (b: B, r: number, h: number, c: number, x: number, y0: number, z: number, seg = 10, kind: PartKind = 'smooth'): void => {
  cyl(b, r, r, h, c, x, y0, z, seg, kind);
};

/** A disc facing +Z (a dial, a knob, an emblem), centred at (x, y, z). */
const badge = (b: B, r: number, t: number, c: number, x: number, y: number, z: number, seg = 8, kind: PartKind = 'smooth'): void => {
  b.add(new CylinderGeometry(r, r, t, seg), c, kind, { x, y, z, rx: Math.PI / 2 });
};

/** A striped umbrella canopy: `wedges` alternating-colour panels, apex at y0 + h. */
const canopy = (b: B, r: number, h: number, colors: readonly number[], x: number, y0: number, z: number, wedges = 12): void => {
  const step = (Math.PI * 2) / wedges;
  for (let i = 0; i < wedges; i += 1) {
    b.add(new ConeGeometry(r, h, 2, 1, true, i * step, step), colors[i % colors.length] ?? C.white, 'leaf', { x, y: y0 + h / 2, z });
  }
};

/** A palm frond along +X: a creased, tapering, drooping blade (16 triangles at 4 segments). */
const frondGeometry = (len: number, width: number, droop: number, segs = 4): BufferGeometry => {
  const spine = (t: number): V3 => [len * t, len * (0.32 * t - droop * t * t), 0];
  const half = (t: number): number => width * Math.sin(Math.PI * Math.min(1, Math.pow(t, 0.8)));
  const pos: number[] = [];
  const push = (...pts: V3[]): void => {
    for (const p of pts) pos.push(p[0], p[1], p[2]);
  };
  for (let i = 0; i < segs; i += 1) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const s0 = spine(t0);
    const s1 = spine(t1);
    const h0 = half(t0);
    const h1 = half(t1);
    const l0: V3 = [s0[0], s0[1] - h0 * 0.3, -h0];
    const l1: V3 = [s1[0], s1[1] - h1 * 0.3, -h1];
    const r0: V3 = [s0[0], s0[1] - h0 * 0.3, h0];
    const r1: V3 = [s1[0], s1[1] - h1 * 0.3, h1];
    push(s0, s1, l0, l0, s1, l1, s0, r0, s1, r0, r1, s1);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
};

/** A palm frond rooted at (x, y, z), pointing along yaw `ry`, pitched up by `pitch`. */
const frond = (b: B, len: number, width: number, droop: number, c: number, x: number, y: number, z: number, ry: number, pitch = 0, segs = 4): void => {
  b.add(frondGeometry(len, width, droop, segs), c, 'leaf', { x, y, z, ry, rz: pitch });
};

/** Build into a scratch builder, then merge it into `b` moved by `t`. */
const sub = (b: B, t: Transform, fn: (s: B) => void): void => {
  const s = new PartBuilder();
  fn(s);
  b.absorb(s, t);
};

// ============================================================ living room

/**
 * A straight run of upholstered sofa centred at the origin: `len` along X,
 * `depth` along Z, backrest at -Z. Seat surface at 1.1, back roll top 2.6.
 */
const sofaRun = (b: B, len: number, depth: number, backT: number, armL: boolean, armR: boolean, n: number, fabric: number, cushion: number, accent: number): void => {
  const z0 = -depth / 2;
  const z1 = depth / 2;
  const armW = 0.5;
  const xL = -len / 2 + (armL ? armW : 0);
  const xR = len / 2 - (armR ? armW : 0);
  for (const lx of [-len / 2 + 0.3, len / 2 - 0.3]) for (const lz of [z0 + 0.3, z1 - 0.3]) blk(b, 0.22, 0.3, 0.22, C.darkWood, lx, 0, lz);
  blk(b, len, 0.55, depth, fabric, 0, 0.3, 0);
  blk(b, len - 0.1, 0.08, 0.04, accent, 0, 0.6, z1 + 0.01);
  blk(b, len, 1.45, backT, fabric, 0, 0.85, z0 + backT / 2);
  rod(b, [-len / 2, 2.3, z0 + backT / 2], [len / 2, 2.3, z0 + backT / 2], 0.3, fabric, 8);
  const cw = (xR - xL) / n;
  const seatD = depth - backT;
  for (let i = 0; i < n; i += 1) {
    const cx = xL + cw * (i + 0.5);
    blk(b, cw - 0.05, 0.25, seatD, cushion, cx, 0.85, z0 + backT + seatD / 2);
    box(b, cw - 0.1, 1.1, 0.22, cushion, cx, 1.68, z0 + backT + 0.12, 'smooth', { rx: -0.1 });
  }
  for (const [on, sx] of [[armL, -1], [armR, 1]] as const) {
    if (!on) continue;
    const ax = sx * (len / 2 - armW / 2);
    blk(b, armW, 1.3, depth, fabric, ax, 0.3, 0);
    rod(b, [ax, 1.6, z0], [ax, 1.6, z1], 0.27, shade(fabric, 1.05), 8);
  }
};

const sofa: Builder = (b) => sofaRun(b, 6, 2.6, 0.7, true, true, 3, 0x2aa79b, 0xf4ecd8, C.coral);

const sofaCorner: Builder = (b) => {
  const fabric = 0xe9dcc4;
  const cushion = 0x9fd8d0;
  sub(b, { z: -2.0 }, (s) => sofaRun(s, 6.4, 2.4, 0.6, false, true, 3, fabric, cushion, C.teal));
  sub(b, { x: -2.0, z: 1.2, ry: Math.PI / 2 }, (s) => sofaRun(s, 4.0, 2.4, 0.6, true, false, 2, fabric, cushion, C.teal));
  // The corner post joining the two backs.
  blk(b, 0.6, 1.45, 0.6, fabric, -2.9, 0.85, -0.5);
  box(b, 0.7, 0.55, 0.7, C.coral, -2.3, 1.45, -2.3, 'smooth', { ry: 0.6, rz: 0.2 });
};

const armchair: Builder = (b) => {
  sofaRun(b, 2.8, 2.6, 0.7, true, true, 1, C.coral, 0xfff1dc, C.cream);
  box(b, 0.6, 0.55, 0.22, C.sunny, 0, 2.05, -0.5, 'smooth', { rx: -0.15 });
};

const beanBag: Builder = (b) => {
  orb(b, 1.2, C.coral, 0, 0.36, 0.1, 8, 'smooth', [1, 0.3, 1]);
  orb(b, 1.0, shade(C.coral, 0.95), 0, 0.72, -0.62, 8, 'smooth', [1.1, 0.68, 0.55]);
  disc(b, 0.18, 0.05, C.cream, 0, 1.38, -0.62, 6);
};

const coffeeTable: Builder = (b) => {
  blk(b, 3.6, 0.16, 2, C.lightWood, 0, 0.94, 0);
  for (const x of [-1.6, 1.6]) for (const z of [-0.8, 0.8]) blk(b, 0.18, 0.94, 0.18, C.white, x, 0, z);
  blk(b, 3.2, 0.08, 1.6, C.white, 0, 0.3, 0);
  blk(b, 0.9, 0.05, 0.55, C.teal, -0.8, 1.1, 0.1);
  blk(b, 0.7, 0.08, 0.5, C.coral, 0.9, 1.1, -0.2, 'smooth', { ry: 0.2 });
  blk(b, 0.6, 0.08, 0.45, C.sky, 0.9, 1.18, -0.2, 'smooth', { ry: -0.1 });
  cyl(b, 0.2, 0.16, 0.25, C.cream, -0.8, 1.15, 0.1, 6);
  gem(b, 0.22, C.leaf, -0.8, 1.48, 0.1);
  blk(b, 1.4, 0.06, 0.9, C.sand, 0.2, 0.38, 0.1);
};

const tv: Builder = (b) => {
  for (const x of [-2.3, 2.3]) for (const z of [-0.5, 0.5]) blk(b, 0.15, 0.2, 0.15, C.darkWood, x, 0, z);
  blk(b, 5, 1.2, 1.4, C.white, 0, 0.2, 0);
  const fronts = [C.teal, C.sand, C.coral];
  fronts.forEach((c, i) => {
    blk(b, 1.5, 0.95, 0.05, c, -1.62 + i * 1.62, 0.32, 0.71);
    blk(b, 0.5, 0.06, 0.06, C.chrome, -1.62 + i * 1.62, 1.12, 0.75);
  });
  blk(b, 1.4, 0.08, 0.6, C.charcoal, 0, 1.4, -0.1);
  blk(b, 0.3, 0.4, 0.15, C.charcoal, 0, 1.45, -0.1);
  blk(b, 4.8, 2.6, 0.16, C.black, 0, 1.8, -0.1);
  box(b, 4.6, 2.4, 0.02, 0x173a73, 0, 3.1, -0.01, 'glow');
  box(b, 0.25, 2.2, 0.01, 0x2f5fa6, 0.9, 3.1, 0.0, 'glow', { rz: -0.6 });
  blk(b, 2.4, 0.25, 0.3, C.charcoal, 0, 1.42, 0.45);
  cyl(b, 0.22, 0.18, 0.35, C.cream, 2.1, 1.4, 0.3, 6);
  gem(b, 0.32, C.leaf, 2.1, 1.95, 0.3);
};

const bookshelf: Builder = (b) => {
  const frame = C.white;
  for (const x of [-1.9, 1.9]) blk(b, 0.2, 6.4, 1.4, frame, x, 0, 0);
  blk(b, 4, 0.2, 1.4, frame, 0, 6.2, 0);
  blk(b, 3.6, 0.3, 1.4, frame, 0, 0, 0);
  blk(b, 3.6, 6.0, 0.1, C.mint, 0, 0.2, -0.65);
  for (const y of [1.6, 3.1, 4.6]) blk(b, 3.6, 0.15, 1.3, frame, 0, y, 0.05);
  // [row base, x, width, height, colour]
  const books: readonly (readonly [number, number, number, number, number])[] = [
    [0.3, -1.25, 0.9, 1.1, C.coral], [0.3, -0.3, 0.8, 0.95, C.navy], [0.3, 0.95, 1.4, 0.7, C.sand],
    [1.75, -1.35, 0.6, 1.1, C.sunny], [1.75, -0.8, 0.5, 0.95, C.teal], [1.75, 0.9, 1.0, 1.05, C.pink],
    [3.25, -1.2, 1.1, 0.9, C.sky], [3.25, 1.3, 0.6, 1.1, C.coral],
    [4.75, -1.4, 0.5, 1.05, C.lilac], [4.75, -0.9, 0.4, 0.9, C.orange],
  ];
  for (const [y, x, w, h, c] of books) blk(b, w, h, 1.0, c, x, y, 0.05);
  blk(b, 1.0, 0.18, 0.8, C.mint, 0.0, 1.75, 0.1);
  blk(b, 0.9, 0.15, 0.75, C.lilac, 0.0, 1.93, 0.1, 'smooth', { ry: 0.15 });
  cyl(b, 0.25, 0.18, 0.7, C.teal, 0.1, 3.25, 0.1, 6);
  cyl(b, 0.3, 0.22, 0.4, C.terracotta, 0.9, 4.75, 0.1, 6);
  gem(b, 0.4, C.leaf, 0.9, 5.4, 0.1, 'flat', [1, 1.1, 1]);
};

const floorLamp: Builder = (b) => {
  disc(b, 0.5, 0.12, C.charcoal, 0, 0, 0, 8);
  rod(b, [0, 0.1, 0], [0, 4.45, 0], 0.06, 0xe8b84a, 6, 'smooth', 0.06, true);
  cyl(b, 0.09, 0.09, 0.12, 0xe8b84a, 0, 2.4, 0, 6);
  cyl(b, 0.42, 0.58, 0.95, C.cream, 0, 4.45, 0, 10);
  disc(b, 0.5, 0.02, C.warm, 0, 4.43, 0, 8, 'glow');
};

const pottedPalm: Builder = (b) => {
  cyl(b, 0.7, 0.48, 1.0, C.terracotta, 0, 0, 0, 10);
  cyl(b, 0.78, 0.78, 0.16, shade(C.terracotta, 1.1), 0, 0.95, 0, 10);
  disc(b, 0.66, 0.04, C.darkWood, 0, 1.08, 0, 8);
  rod(b, [0, 1.05, 0], [0.08, 2.85, 0.04], 0.13, C.bark, 6, 'flat', 0.09, true);
  for (let i = 0; i < 7; i += 1) frond(b, 1.15, 0.28, 0.6, i % 2 ? C.palm : C.leaf, 0.08, 2.85, 0.04, (i / 7) * Math.PI * 2, 1.05 - (i % 3) * 0.12, 3);
};

const rug: Builder = (b) => {
  blk(b, 6, 0.03, 4.4, C.coral, 0, 0, 0);
  blk(b, 5.5, 0.04, 3.9, C.cream, 0, 0, 0);
  blk(b, 4.4, 0.05, 2.8, C.teal, 0, 0, 0);
  blk(b, 1.4, 0.06, 1.4, C.sunny, 0, 0, 0, 'smooth', { ry: Math.PI / 4 });
  for (const x of [-1.6, 1.6]) blk(b, 0.6, 0.06, 0.6, C.cream, x, 0, 0, 'smooth', { ry: Math.PI / 4 });
};

const wallArt: Builder = (b) => {
  blk(b, 3.2, 2.4, 0.1, C.white, 0, 0, -0.05);
  const z = 0.02;
  blk(b, 2.9, 0.5, 0.04, C.pink, 0, 1.75, z);
  blk(b, 2.9, 0.5, 0.04, C.peach, 0, 1.25, z);
  blk(b, 2.9, 0.5, 0.04, C.teal, 0, 0.75, z);
  blk(b, 2.9, 0.6, 0.04, C.sand, 0, 0.15, z);
  badge(b, 0.32, 0.04, C.sunny, 0.65, 1.42, 0.05, 8);
  beam(b, [-0.85, 0.35, 0.06], [-0.6, 1.75, 0.06], 0.08, 0.04, C.deepLeaf);
  for (let i = 0; i < 4; i += 1) box(b, 0.55, 0.08, 0.03, C.deepLeaf, -0.6 + Math.cos(i * 1.1 + 0.3) * 0.25, 1.72 - Math.abs(Math.sin(i)) * 0.08, 0.07, 'smooth', { rz: 0.6 - i * 0.45 });
  for (const [w, h, x, y] of [[3.2, 0.15, 0, 2.25], [3.2, 0.15, 0, 0], [0.15, 2.4, -1.525, 0], [0.15, 2.4, 1.525, 0]] as const) blk(b, w, h, 0.18, C.lightWood, x, y, 0.0);
};

const aquarium: Builder = (b) => {
  blk(b, 4, 1.6, 1.6, C.darkWood, 0, 0, 0);
  for (const x of [-1, 1]) {
    blk(b, 1.85, 1.3, 0.05, C.wood, x, 0.15, 0.81);
    blk(b, 0.06, 0.4, 0.06, C.chrome, x * 0.2, 0.7, 0.86);
  }
  blk(b, 4, 0.15, 1.6, C.black, 0, 1.6, 0);
  box(b, 3.8, 1.95, 1.0, 0x48b9e6, 0, 2.72, -0.15, 'glow');
  blk(b, 3.8, 0.3, 1.4, C.sand, 0, 1.75, 0);
  for (const x of [-1.95, 1.95]) for (const z of [-0.75, 0.75]) blk(b, 0.1, 2.0, 0.1, C.black, x, 1.75, z);
  blk(b, 4, 0.25, 1.6, C.black, 0, 3.75, 0);
  blk(b, 3.8, 0.05, 0.05, C.white, 0, 3.7, 0.75, 'glow');
  const fish: readonly (readonly [number, number, number])[] = [[-1.2, 2.9, C.orange], [0.4, 3.3, C.sunny], [1.2, 2.5, C.pink], [-0.3, 2.3, 0x3fa9ff], [0.9, 3.0, C.orange]];
  fish.forEach(([x, y, c], i) => {
    const dir = i % 2 ? -1 : 1;
    box(b, 0.38, 0.22, 0.06, c, x, y, 0.38);
    box(b, 0.16, 0.16, 0.05, c, x - dir * 0.24, y, 0.38, 'smooth', { rz: Math.PI / 4 });
  });
  for (const [x, h] of [[-1.6, 1.3], [-1.35, 0.9], [1.55, 1.1]] as const) box(b, 0.18, h, 0.04, C.leaf, x, 2.05 + h / 2, 0.4, 'leaf', { rz: 0.1 });
  gem(b, 0.25, C.stone, 0.4, 2.1, 0.3);
};

const piano: Builder = (b) => {
  const lacquer = 0x1c1c24;
  const gold = 0xe8b84a;
  for (const [x, z] of [[-1.8, 1.45], [1.8, 1.45], [-0.6, -1.8]] as const) cyl(b, 0.17, 0.13, 1.6, lacquer, x, 0, z, 6);
  blk(b, 0.5, 0.6, 0.2, lacquer, 0, 0.1, 1.0);
  blk(b, 4.4, 1.0, 1.5, lacquer, 0, 1.6, 0.95);
  blk(b, 2.8, 1.0, 2.5, lacquer, -0.8, 1.6, -1.05);
  b.add(new CylinderGeometry(1.6, 1.6, 1.0, 10, 1, false, Math.PI / 2, Math.PI), lacquer, 'smooth', { x: 0.6, y: 2.1, z: 0.2, sz: 1.25 });
  blk(b, 4.4, 0.08, 0.04, gold, 0, 1.75, 1.71);
  blk(b, 4.4, 0.35, 0.6, lacquer, 0, 1.6, 2.0);
  blk(b, 3.9, 0.1, 0.5, C.white, 0, 1.92, 2.02);
  for (let i = 0; i < 5; i += 1) blk(b, 0.5, 0.08, 0.28, C.black, -1.6 + i * 0.8, 2.02, 1.9);
  for (const x of [-2.075, 2.075]) blk(b, 0.25, 0.5, 0.6, lacquer, x, 1.6, 2.0);
  box(b, 1.6, 0.6, 0.06, lacquer, 0, 2.85, 1.55, 'smooth', { rx: -0.25 });
  box(b, 1.2, 0.45, 0.02, C.cream, 0, 2.88, 1.6, 'smooth', { rx: -0.25 });
  box(b, 4.4, 0.06, 3.6, lacquer, -0.032, 2.97, -0.2, 'smooth', { rz: 0.17 });
  rod(b, [1.5, 2.6, -0.3], [1.5, 3.22, -0.3], 0.03, gold, 4);
  // The bench, out at the keyboard end where the pianist sits.
  for (const x of [-0.85, 0.85]) for (const z of [2.7, 3.3]) blk(b, 0.12, 0.9, 0.12, lacquer, x, 0, z);
  blk(b, 2.0, 0.25, 0.9, lacquer, 0, 0.89, 3.0);
  blk(b, 1.9, 0.06, 0.8, 0x9b2c3c, 0, 1.14, 3.0);
};

const arcade: Builder = (b) => {
  const side = 0x7a5cff;
  for (const x of [-1.0, 1.0]) {
    blk(b, 0.2, 5.6, 2.2, side, x, 0, 0);
    box(b, 0.04, 0.12, 2.6, 0xff6fb5, x * 1.11, 2.6, 0, 'glow', { rx: 0.7 });
  }
  blk(b, 1.8, 5.3, 1.6, C.ink, 0, 0, -0.3);
  blk(b, 0.8, 0.9, 0.05, C.charcoal, 0, 0.5, 0.52);
  for (const x of [-0.18, 0.18]) blk(b, 0.12, 0.2, 0.03, C.red, x, 0.85, 0.56, 'glow');
  box(b, 1.8, 0.25, 0.9, C.charcoal, 0, 2.75, 0.7, 'smooth', { rx: 0.22 });
  rod(b, [-0.4, 2.85, 0.75], [-0.4, 3.2, 0.75], 0.04, C.black, 4);
  orb(b, 0.13, C.red, -0.4, 3.25, 0.75, 6);
  for (const [i, c] of [[0, C.sunny], [1, 0x3cf0ff], [2, 0xff6fb5]] as const) blk(b, 0.16, 0.08, 0.16, c, 0.15 + i * 0.27, 2.86, 0.68 - i * 0.04);
  box(b, 1.7, 1.45, 0.1, C.black, 0, 3.75, 0.48, 'smooth', { rx: -0.2 });
  box(b, 1.45, 1.2, 0.02, 0x10204a, 0, 3.75, 0.545, 'glow', { rx: -0.2 });
  for (const [x, y, c] of [[-0.4, 3.9, C.sunny], [0.1, 3.9, 0xff6fb5], [0.35, 3.5, 0x3cf0ff], [-0.2, 3.45, 0x7dff7a]] as const) box(b, 0.14, 0.14, 0.02, c, x, y, 0.56 + (3.75 - y) * 0.2, 'glow', { rx: -0.2 });
  blk(b, 1.8, 0.6, 0.1, 0xffd23f, 0, 4.85, 0.5, 'glow');
  blk(b, 1.5, 0.25, 0.02, 0xff4f9a, 0, 5.0, 0.56, 'glow');
  blk(b, 2.2, 0.12, 2.2, side, 0, 5.48, 0);
};

const poolTable: Builder = (b) => {
  const wood = 0x8a5a36;
  for (const x of [-1.8, 1.8]) for (const z of [-3.2, 3.2]) blk(b, 0.5, 1.55, 0.5, C.darkWood, x, 0, z);
  blk(b, 4.2, 0.5, 7.2, wood, 0, 1.5, 0);
  blk(b, 4.0, 0.1, 7.0, 0x1e9e8a, 0, 2.0, 0);
  for (const x of [-2.15, 2.15]) blk(b, 0.3, 0.3, 7.6, wood, x, 2.0, 0);
  for (const z of [-3.65, 3.65]) blk(b, 4.6, 0.3, 0.3, wood, 0, 2.0, z);
  for (const x of [-1.95, 1.95]) for (const z of [-3.45, 0, 3.45]) blk(b, 0.42, 0.06, 0.42, C.black, x, 2.1, z);
  for (const [x, z, c] of [[0, 1.8, C.white], [0, -1.9, C.red], [-0.15, -2.15, C.sunny], [0.15, -2.15, 0x2f6bff]] as const) gem(b, 0.15, c, x, 2.25, z, 'smooth');
  rod(b, [-1.4, 2.32, 0.8], [0.35, 2.32, 3.3], 0.035, C.lightWood, 5, 'smooth', 0.05);
};

// ================================================================ bedroom

/** A bed: headboard at -Z, mattress top (lying surface) at `top`. */
const bedModel = (b: B, w: number, d: number, h: number, top: number, pillows: readonly number[], duvet: number, head: number): void => {
  const z0 = -d / 2;
  const fz = (z0 + 0.3 + d / 2) / 2;
  const fd = d - 0.3;
  for (const x of [-w / 2 + 0.25, w / 2 - 0.25]) for (const z of [z0 + 0.5, d / 2 - 0.25]) blk(b, 0.3, 0.25, 0.3, C.darkWood, x, 0, z);
  blk(b, w, 0.55, fd, C.lightWood, 0, 0.25, fz);
  const mTop = top - 0.07;
  blk(b, w - 0.2, mTop - 0.8, fd - 0.2, C.white, 0, 0.8, fz);
  const duvetZ0 = z0 + d * 0.3;
  const dd = d / 2 - duvetZ0;
  blk(b, w - 0.1, 0.07, dd, duvet, 0, mTop, duvetZ0 + dd / 2);
  blk(b, w - 0.1, 0.09, 0.45, C.cream, 0, mTop, duvetZ0 + 0.2);
  for (const sx of [-1, 1]) blk(b, 0.05, 0.55, dd, duvet, sx * (w / 2 - 0.05), mTop - 0.48, duvetZ0 + dd / 2);
  blk(b, w - 0.1, 0.55, 0.05, duvet, 0, mTop - 0.48, d / 2 - 0.08);
  for (const x of pillows) box(b, Math.min(1.6, w - 0.6), 0.32, 0.9, C.white, x, top + 0.1, z0 + 0.9, 'smooth', { rx: -0.2 });
  blk(b, w, h, 0.3, head, 0, 0, z0 + 0.15);
  blk(b, w - 0.6, h * 0.42, 0.1, C.cream, 0, h * 0.5, z0 + 0.33);
  rod(b, [-w / 2, h, z0 + 0.15], [w / 2, h, z0 + 0.15], 0.15, shade(head, 1.06), 6);
};

const bed: Builder = (b) => bedModel(b, 4.6, 6.6, 2.45, 1.5, [-1, 1], C.coral, C.teal);
const bedSingle: Builder = (b) => bedModel(b, 2.8, 6.2, 2.25, 1.4, [0], 0x86ccf5, C.peach);

const dresser: Builder = (b) => {
  for (const x of [-1.8, 1.8]) for (const z of [-0.7, 0.7]) blk(b, 0.2, 0.2, 0.2, C.darkWood, x, 0, z);
  blk(b, 4, 2.7, 1.8, C.white, 0, 0.2, 0);
  blk(b, 4.1, 0.1, 1.86, C.lightWood, 0, 2.9, 0);
  for (let row = 0; row < 3; row += 1) {
    for (const x of [-0.98, 0.98]) {
      blk(b, 1.85, 0.75, 0.06, (row + (x > 0 ? 1 : 0)) % 2 ? C.peach : C.mint, x, 0.32 + row * 0.85, 0.92);
      blk(b, 0.3, 0.08, 0.08, 0xe8b84a, x, 0.66 + row * 0.85, 0.97);
    }
  }
  cyl(b, 0.18, 0.22, 0.4, C.teal, -1.3, 3.0, 0, 6);
  gem(b, 0.2, C.pink, -1.3, 3.5, 0, 'smooth');
  box(b, 0.7, 0.55, 0.08, C.sunny, 1.2, 3.12, -0.3, 'smooth', { rx: -0.2 });
  box(b, 0.55, 0.4, 0.02, C.sky, 1.2, 3.13, -0.25, 'smooth', { rx: -0.2 });
};

const desk: Builder = (b) => {
  blk(b, 4, 0.15, 2, C.lightWood, 0, 2.25, 0);
  for (const z of [-0.85, 0.85]) blk(b, 0.15, 2.25, 0.15, C.white, -1.85, 0, z);
  blk(b, 1.2, 2.25, 1.8, C.white, 1.3, 0, 0);
  for (let i = 0; i < 3; i += 1) {
    blk(b, 1.1, 0.62, 0.05, i % 2 ? C.teal : C.coral, 1.3, 0.12 + i * 0.7, 0.92);
    blk(b, 0.35, 0.06, 0.06, C.chrome, 1.3, 0.55 + i * 0.7, 0.97);
  }
  blk(b, 1.1, 0.05, 0.75, C.charcoal, -0.5, 2.4, 0.15);
  box(b, 1.1, 0.75, 0.04, C.charcoal, -0.5, 2.8, -0.26, 'smooth', { rx: -0.2 });
  box(b, 1.0, 0.65, 0.01, 0x2a6fd6, -0.5, 2.8, -0.235, 'glow', { rx: -0.2 });
  cyl(b, 0.13, 0.13, 0.3, C.coral, 0.6, 2.4, 0.3, 6);
  cyl(b, 0.12, 0.12, 0.35, C.sunny, 1.4, 2.4, -0.5, 6);
  for (const dx of [-0.05, 0.05]) rod(b, [1.4 + dx, 2.6, -0.5], [1.4 + dx * 3, 2.95, -0.5], 0.02, C.navy, 3);
};

const officeChair: Builder = (b) => {
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    box(b, 0.16, 0.12, 0.8, C.charcoal, Math.sin(a) * 0.4, 0.2, Math.cos(a) * 0.4, 'smooth', { ry: a });
    blk(b, 0.18, 0.14, 0.18, C.black, Math.sin(a) * 0.78, 0, Math.cos(a) * 0.78);
  }
  rod(b, [0, 0.2, 0], [0, 1.05, 0], 0.08, C.chrome, 6, 'smooth', 0.08, true);
  blk(b, 1.4, 0.2, 1.4, C.charcoal, 0, 1.04, 0);
  blk(b, 1.35, 0.06, 1.3, C.teal, 0, 1.24, 0.03);
  rod(b, [0, 1.15, -0.55], [0, 1.75, -0.85], 0.06, C.charcoal, 4);
  box(b, 1.3, 1.6, 0.16, C.charcoal, 0, 2.45, -0.88, 'smooth', { rx: -0.08 });
  box(b, 1.2, 1.45, 0.06, C.teal, 0, 2.45, -0.78, 'smooth', { rx: -0.08 });
  for (const sx of [-1, 1]) {
    rod(b, [sx * 0.72, 1.2, -0.1], [sx * 0.72, 1.85, -0.1], 0.05, C.charcoal, 4);
    blk(b, 0.2, 0.08, 0.8, C.charcoal, sx * 0.72, 1.85, 0);
  }
};

const wardrobe: Builder = (b) => {
  for (const x of [-1.8, 1.8]) for (const z of [-0.8, 0.8]) blk(b, 0.2, 0.2, 0.2, C.darkWood, x, 0, z);
  blk(b, 4, 6.15, 2, C.white, 0, 0.2, 0);
  blk(b, 4.15, 0.25, 2.1, C.lightWood, 0, 6.35, 0);
  blk(b, 1.88, 5.75, 0.06, C.mint, -0.97, 0.4, 1.02);
  blk(b, 1.88, 5.75, 0.06, 0xcdeefa, 0.97, 0.4, 1.02);
  box(b, 0.25, 2.6, 0.01, 0xf2fbff, 1.2, 3.6, 1.06, 'glow', { rz: -0.5 });
  for (const x of [-0.18, 0.18]) blk(b, 0.08, 1.2, 0.08, 0xe8b84a, x, 2.7, 1.1);
};

// ================================================================ kitchen

const fridge: Builder = (b) => {
  const body = C.mint;
  for (const x of [-1.1, 1.1]) for (const z of [-0.9, 0.9]) blk(b, 0.2, 0.2, 0.2, C.black, x, 0, z);
  blk(b, 2.6, 5.75, 2.3, body, 0, 0.2, -0.05);
  blk(b, 2.6, 0.45, 1.85, body, 0, 5.95, -0.27);
  rod(b, [-1.3, 5.95, 0.65], [1.3, 5.95, 0.65], 0.45, body, 10);
  blk(b, 2.5, 0.06, 0.04, shade(body, 0.75), 0, 4.3, 1.11);
  for (const [y0, y1] of [[4.6, 5.6], [2.4, 3.9]] as const) {
    rod(b, [1.0, y0, 1.28], [1.0, y1, 1.28], 0.06, C.chrome, 6);
    for (const y of [y0, y1]) blk(b, 0.1, 0.1, 0.2, C.chrome, 1.0, y - 0.05, 1.17);
  }
  badge(b, 0.22, 0.04, C.chrome, -0.7, 5.0, 1.12, 8);
  for (const [x, y, c] of [[-0.6, 3.3, C.coral], [-0.2, 3.0, C.sunny], [-0.75, 2.6, C.sky]] as const) blk(b, 0.22, 0.22, 0.04, c, x, y, 1.12);
  blk(b, 0.6, 0.45, 0.02, C.white, -0.3, 2.4, 1.11, 'smooth', { rz: 0.08 });
};

const kitchenCounter: Builder = (b) => {
  blk(b, 5.9, 0.2, 2.0, C.charcoal, 0, 0, -0.2);
  blk(b, 6, 2.6, 2.2, C.white, 0, 0.2, -0.1);
  [-2.2, -0.75, 0.75, 2.2].forEach((x, i) => {
    blk(b, 1.4, 2.2, 0.05, i === 2 || i === 1 ? C.aqua : C.teal, x, 0.4, 1.02);
    blk(b, 0.06, 0.5, 0.06, C.chrome, x + (i % 2 ? -0.55 : 0.55), 1.9, 1.07);
  });
  blk(b, 6.05, 0.2, 2.4, 0xf2efe8, 0, 2.8, 0);
  blk(b, 1.6, 0.02, 1.2, C.steel, 1.2, 3.0, 0.1);
  blk(b, 1.4, 0.02, 1.0, C.metal, 1.2, 3.01, 0.1);
  rod(b, [1.2, 3.0, -0.75], [1.2, 3.7, -0.75], 0.06, C.chrome, 6);
  rod(b, [1.2, 3.7, -0.75], [1.2, 3.62, -0.3], 0.05, C.chrome, 6);
  blk(b, 0.12, 0.25, 0.06, C.chrome, 1.5, 3.0, -0.75);
  blk(b, 1.3, 0.06, 0.8, C.lightWood, -1.4, 3.0, 0.2, 'smooth', { ry: 0.15 });
  orb(b, 0.18, C.lemon, -1.6, 3.24, 0.2, 6);
  orb(b, 0.16, 0x8ad14e, -1.25, 3.22, 0.35, 6);
  cyl(b, 0.22, 0.2, 0.45, C.coral, -2.5, 3.0, -0.6, 6);
  for (const dx of [-0.07, 0.06]) rod(b, [-2.5 + dx, 3.3, -0.6], [-2.5 + dx * 2.5, 3.75, -0.6], 0.025, C.lightWood, 3);
};

const stove: Builder = (b) => {
  blk(b, 2.6, 2.6, 2.3, C.cream, 0, 0.1, -0.05);
  blk(b, 2.5, 0.1, 2.1, C.charcoal, 0, 0, -0.05);
  blk(b, 2.2, 1.5, 0.06, C.charcoal, 0, 0.45, 1.13);
  blk(b, 1.4, 0.6, 0.02, 0x8a4a20, 0, 0.9, 1.16, 'glow');
  rod(b, [-0.9, 2.12, 1.32], [0.9, 2.12, 1.32], 0.05, C.chrome, 6);
  for (const x of [-0.9, 0.9]) blk(b, 0.08, 0.08, 0.18, C.chrome, x, 2.08, 1.2);
  blk(b, 2.4, 0.3, 0.05, C.coral, 0, 2.3, 1.13);
  for (let i = 0; i < 4; i += 1) blk(b, 0.14, 0.14, 0.08, C.chrome, -0.9 + i * 0.6, 2.38, 1.17);
  blk(b, 2.6, 0.08, 2.3, C.black, 0, 2.7, -0.05);
  for (const [x, z, hot] of [[-0.6, 0.45, false], [0.6, 0.45, true], [-0.6, -0.6, false], [0.6, -0.6, false]] as const) {
    disc(b, 0.36, 0.04, C.charcoal, x, 2.78, z, 6);
    if (hot) disc(b, 0.24, 0.02, 0xff5a2a, x, 2.82, z, 8, 'glow');
  }
  cyl(b, 0.38, 0.35, 0.42, C.red, -0.6, 2.82, 0.45, 8);
  blk(b, 0.6, 0.06, 0.1, C.charcoal, -0.6, 3.1, 0.95);
  blk(b, 2.6, 0.3, 0.15, C.cream, 0, 2.7, -1.12);
};

const diningTable: Builder = (b) => {
  blk(b, 5, 0.18, 3, C.lightWood, 0, 2.02, 0);
  blk(b, 4.6, 0.25, 2.6, C.wood, 0, 1.77, 0);
  for (const x of [-2.2, 2.2]) for (const z of [-1.2, 1.2]) blk(b, 0.25, 1.77, 0.25, C.wood, x, 0, z);
  blk(b, 4.4, 0.02, 0.8, C.teal, 0, 2.2, 0);
  for (const x of [-1.6, 1.6]) for (const z of [-0.9, 0.9]) disc(b, 0.35, 0.02, C.white, x, 2.2, z, 8);
  cyl(b, 0.18, 0.24, 0.55, C.cream, 0, 2.22, 0, 6);
  for (const [x, z, c] of [[0, 0, C.pink], [0.18, 0.1, C.coral], [-0.15, -0.1, C.sunny]] as const) gem(b, 0.16, c, x, 2.95 + Math.abs(x), z, 'smooth');
  for (const s of [-1, 1]) box(b, 0.1, 0.5, 0.03, C.leaf, s * 0.2, 2.9, 0, 'leaf', { rz: s * 0.5 });
};

const chairModel = (b: B, seatY: number, frame: number, cushion: number, backH: number): void => {
  for (const x of [-0.6, 0.6]) for (const z of [-0.6, 0.6]) blk(b, 0.14, seatY - 0.18, 0.14, frame, x, 0, z);
  blk(b, 1.4, 0.12, 1.4, frame, 0, seatY - 0.18, 0);
  blk(b, 1.3, 0.06, 1.25, cushion, 0, seatY - 0.06, 0.03);
  for (const x of [-0.6, 0.6]) blk(b, 0.14, backH, 0.14, frame, x, seatY - 0.06, -0.65);
  for (const y of [0.75, 1.35]) blk(b, 1.2, 0.3, 0.08, frame, 0, seatY + y - 0.06, -0.65);
};

const chair: Builder = (b) => chairModel(b, 1.2, C.lightWood, C.teal, 1.8);

const barStool: Builder = (b) => {
  disc(b, 0.5, 0.08, C.chrome, 0, 0, 0, 8);
  rod(b, [0, 0.05, 0], [0, 2.05, 0], 0.07, C.chrome, 6, 'smooth', 0.07, true);
  ring(b, 0.4, 0.04, C.chrome, { y: 0.85, rx: Math.PI / 2 }, 'smooth', 10, 3);
  for (const a of [0, Math.PI / 2]) box(b, 0.8, 0.04, 0.04, C.chrome, 0, 0.85, 0, 'smooth', { ry: a });
  disc(b, 0.4, 0.06, C.chrome, 0, 2.0, 0, 8);
  cyl(b, 0.55, 0.5, 0.24, C.coral, 0, 2.06, 0, 10);
  for (const x of [-0.3, 0.3]) rod(b, [x, 2.2, -0.45], [x, 2.45, -0.5], 0.03, C.chrome, 4);
  box(b, 0.85, 0.18, 0.08, C.coral, 0, 2.5, -0.5);
};

// ================================================================== bath

const toilet: Builder = (b) => {
  cyl(b, 0.42, 0.52, 0.8, C.white, 0, 0, 0.2, 10, 'smooth', false, { sz: 1.3 });
  cyl(b, 0.72, 0.5, 0.35, C.white, 0, 0.8, 0.3, 10, 'smooth', false, { sz: 1.22 });
  cyl(b, 0.74, 0.74, 0.05, C.sky, 0, 1.15, 0.3, 10, 'smooth', false, { sz: 1.22 });
  box(b, 1.3, 1.25, 0.08, C.sky, 0, 1.78, -0.5, 'smooth', { rx: -0.12 });
  blk(b, 1.5, 1.1, 0.55, C.white, 0, 1.4, -0.82);
  blk(b, 1.6, 0.1, 0.62, C.white, 0, 2.5, -0.82);
  disc(b, 0.1, 0.04, C.chrome, 0, 2.6, -0.82, 6);
  rod(b, [0, 0.6, -0.55], [0, 1.4, -0.85], 0.12, C.white, 6);
};

const bathtub: Builder = (b) => {
  const gold = 0xe8b84a;
  for (const x of [-1.05, 1.05]) for (const z of [-2.2, 2.2]) cyl(b, 0.15, 0.1, 0.3, gold, x, 0, z, 6);
  blk(b, 2.6, 0.35, 5.2, C.white, 0, 0.3, 0);
  for (const x of [-1.275, 1.275]) blk(b, 0.25, 1.5, 5.4, C.white, x, 0.3, 0);
  for (const z of [-2.55, 2.55]) blk(b, 2.3, 1.5, 0.3, C.white, 0, 0.3, z);
  blk(b, 2.3, 0.12, 4.8, 0x9fe3f5, 0, 0.65, 0);
  for (const [x, z, r] of [[-0.6, 1.8, 0.28], [0.5, 2.0, 0.22], [0.1, 1.5, 0.2], [0.8, -1.9, 0.18]] as const) gem(b, r, C.white, x, 0.8, z, 'smooth', [1, 0.6, 1]);
  rod(b, [0, 1.8, 2.55], [0, 2.3, 2.55], 0.07, C.chrome, 6);
  rod(b, [0, 2.3, 2.55], [0, 2.15, 2.1], 0.06, C.chrome, 6);
  for (const x of [-0.3, 0.3]) blk(b, 0.12, 0.12, 0.12, C.chrome, x, 1.8, 2.55);
  blk(b, 0.32, 0.24, 0.42, 0xffe14a, 1.15, 1.8, 0.8);
  blk(b, 0.24, 0.22, 0.22, 0xffe14a, 1.15, 2.0, 0.95);
  blk(b, 0.12, 0.06, 0.12, C.orange, 1.15, 2.08, 1.1);
};

const sink: Builder = (b) => {
  for (const x of [-1.1, 1.1]) for (const z of [-0.6, 0.6]) blk(b, 0.15, 0.2, 0.15, C.chrome, x, 0, z);
  blk(b, 2.6, 2.4, 1.6, C.lightWood, 0, 0.2, 0);
  for (const x of [-0.64, 0.64]) {
    blk(b, 1.24, 2.0, 0.05, C.white, x, 0.35, 0.81);
    blk(b, 0.06, 0.4, 0.06, C.chrome, x * 0.25, 1.6, 0.86);
  }
  blk(b, 2.65, 0.15, 1.65, 0xf2efe8, 0, 2.6, 0);
  cyl(b, 0.55, 0.4, 0.3, C.white, 0, 2.75, 0.1, 10);
  disc(b, 0.45, 0.01, 0x9fe3f5, 0, 3.04, 0.1, 8);
  rod(b, [0, 2.75, -0.6], [0, 3.25, -0.6], 0.06, C.chrome, 6);
  rod(b, [0, 3.25, -0.6], [0, 3.2, -0.25], 0.05, C.chrome, 6);
  cyl(b, 0.1, 0.12, 0.3, C.pink, 0.9, 2.75, -0.4, 6);
  blk(b, 0.04, 1.1, 0.7, C.teal, 1.33, 1.3, 0.1, 'leaf');
  rod(b, [1.36, 2.45, -0.3], [1.36, 2.45, 0.5], 0.03, C.chrome, 4);
};

// =============================================================== outdoor

const hotTub: Builder = (b) => {
  const clad = 0xc28a5a;
  const tile = 0x5fd0d8;
  blk(b, 5.8, 0.3, 5.8, tile, 0, 0, 0);
  for (const z of [-3.2, 3.2]) blk(b, 7, 1.6, 0.6, clad, 0, 0, z);
  for (const x of [-3.2, 3.2]) blk(b, 0.6, 1.6, 5.8, clad, x, 0, 0);
  for (const z of [-2.88, 2.88]) blk(b, 5.8, 1.3, 0.05, tile, 0, 0.3, z);
  for (const x of [-2.88, 2.88]) blk(b, 0.05, 1.3, 5.7, tile, x, 0.3, 0);
  for (const z of [-3.1, 3.1]) blk(b, 7, 0.2, 0.8, C.stone, 0, 1.6, z);
  for (const x of [-3.1, 3.1]) blk(b, 0.8, 0.2, 5.4, C.stone, x, 1.6, 0);
  for (const z of [-2.35, 2.35]) blk(b, 5.7, 0.7, 1.0, C.white, 0, 0.3, z);
  for (const x of [-2.35, 2.35]) blk(b, 1.0, 0.7, 3.7, C.white, x, 0.3, 0);
  box(b, 5.75, 0.08, 5.75, 0x7fe3f0, 0, 1.48, 0, 'glow');
  for (const [x, z] of [[-1.2, 0.5], [0.8, -1.0], [1.3, 1.2], [-0.4, -1.6], [0.1, 0.4]] as const) gem(b, 0.14, C.white, x, 1.54, z, 'glow', [1, 0.4, 1]);
  for (const [x, z] of [[-2.88, 0], [2.88, 0]] as const) box(b, 0.04, 0.3, 0.3, C.warm, x * 0.99, 0.95, z, 'glow');
  for (const [x, c] of [[2.4, C.coral], [1.6, C.sunny]] as const) rod(b, [x, 1.95, 3.0], [x, 1.95, 3.45], 0.2, c, 8);
  blk(b, 0.6, 0.12, 0.4, C.charcoal, -3.2, 1.8, 2.6);
};

const sunLounger: Builder = (b) => {
  for (const x of [-0.9, 0.9]) {
    blk(b, 0.12, 0.12, 5.2, C.white, x, 0.5, 0);
    for (const z of [-2.4, 1.6]) blk(b, 0.12, 0.55, 0.12, C.white, x, 0, z);
    cyl(b, 0.25, 0.25, 0.1, C.charcoal, x * 1.04, 0.0, 2.4, 8, 'smooth', false, { rz: Math.PI / 2, y: 0.28 });
  }
  blk(b, 1.8, 0.12, 3.5, C.white, 0, 0.66, 0.9);
  blk(b, 1.7, 0.22, 3.35, C.teal, 0, 0.78, 0.95);
  for (const z of [-0.2, 0.9, 2.0]) blk(b, 1.72, 0.225, 0.3, C.white, 0, 0.78, z);
  beam(b, [0, 0.89, -0.75], [0, 1.28, -2.6], 1.7, 0.22, C.teal);
  beam(b, [0, 0.7, -0.75], [0, 1.1, -2.5], 1.8, 0.1, C.white);
  rod(b, [-0.5, 0.56, -2.0], [-0.5, 1.0, -2.3], 0.04, C.white, 4);
  rod(b, [0.5, 0.56, -2.0], [0.5, 1.0, -2.3], 0.04, C.white, 4);
};

const bbq: Builder = (b) => {
  const body = 0xe8584f;
  for (const x of [-0.7, 0.7]) for (const z of [-0.5, 0.5]) rod(b, [x, 0, z], [x, 1.8, z], 0.06, C.charcoal, 4);
  for (const z of [-0.55, 0.55]) cyl(b, 0.22, 0.22, 0.1, C.black, -0.7, 0, z, 6, 'smooth', false, { rx: Math.PI / 2, y: 0.22 });
  blk(b, 1.5, 0.06, 1.1, C.charcoal, 0, 0.5, 0);
  cyl(b, 0.28, 0.28, 0.75, C.white, 0.3, 0.56, 0, 8);
  blk(b, 1.6, 0.6, 1.3, body, 0, 1.8, 0);
  b.add(new CylinderGeometry(0.65, 0.65, 1.6, 10, 1, false, 0, Math.PI), body, 'smooth', { y: 2.4, rz: Math.PI / 2 });
  rod(b, [-0.55, 2.62, 0.82], [0.55, 2.62, 0.82], 0.05, C.chrome, 6);
  for (const x of [-0.55, 0.55]) blk(b, 0.06, 0.06, 0.2, C.chrome, x, 2.59, 0.7);
  badge(b, 0.12, 0.04, C.chrome, 0, 2.75, 0.62, 8);
  for (let i = 0; i < 3; i += 1) blk(b, 0.14, 0.14, 0.08, C.black, -0.45 + i * 0.45, 2.03, 0.68);
  for (const x of [-1.05, 1.05]) blk(b, 0.5, 0.06, 1.1, C.lightWood, x, 2.3, 0);
  for (const x of [-0.95, 1.15]) blk(b, 0.04, 0.04, 0.6, C.metal, x, 2.37, 0.1);
  cyl(b, 0.08, 0.08, 0.45, C.charcoal, 0.4, 2.75, -0.45, 6);
};

const patioSet: Builder = (b) => {
  disc(b, 0.6, 0.08, C.charcoal, 0, 0, 0, 8);
  rod(b, [0, 0.05, 0], [0, 2.05, 0], 0.12, C.white, 6);
  disc(b, 1.35, 0.1, C.aqua, 0, 2.05, 0, 12);
  rod(b, [0, 2.1, 0], [0, 6.25, 0], 0.06, C.white, 6);
  canopy(b, 2.1, 1.0, [C.teal, C.white], 0, 5.3, 0, 10);
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    rod(b, [0, 5.0, 0], [Math.sin(a) * 1.6, 5.42, Math.cos(a) * 1.6], 0.025, C.white, 3);
  }
  orb(b, 0.1, C.white, 0, 6.32, 0, 6);
  for (const s of [-1, 1]) {
    sub(b, { x: s * 1.55, ry: -s * Math.PI / 2 }, (c) => {
      for (const x of [-0.35, 0.35]) for (const z of [-0.35, 0.35]) blk(c, 0.08, 1.0, 0.08, C.white, x, 0, z);
      blk(c, 0.9, 0.1, 0.9, C.white, 0, 1.0, 0);
      blk(c, 0.85, 0.06, 0.85, C.coral, 0, 1.1, 0);
      box(c, 0.9, 0.8, 0.08, C.white, 0, 1.6, -0.45, 'smooth', { rx: -0.12 });
    });
  }
};

const flamingo: Builder = (b) => {
  const pink = 0xff6f9f;
  for (const x of [-0.08, 0.08]) rod(b, [x, 0, -0.05], [x * 0.6, 1.55, -0.12], 0.035, C.charcoal, 4);
  orb(b, 0.45, pink, 0, 1.85, -0.12, 8, 'smooth', [0.85, 0.72, 1.35]);
  for (const s of [-1, 1]) orb(b, 0.28, 0xff9ec2, s * 0.3, 1.92, -0.2, 6, 'smooth', [0.35, 0.6, 1.4]);
  spike(b, 0.16, 0.5, pink, 0, 1.75, -0.65, 6, 'smooth', false, { rx: -Math.PI / 2 - 0.35, y: 1.95 });
  rod(b, [0, 2.0, 0.35], [0, 2.55, 0.15], 0.08, pink, 6, 'smooth', 0.07);
  rod(b, [0, 2.55, 0.15], [0, 2.82, 0.36], 0.07, pink, 6, 'smooth', 0.07);
  orb(b, 0.17, pink, 0, 2.86, 0.42, 6);
  rod(b, [0, 2.84, 0.55], [0, 2.7, 0.7], 0.06, C.cream, 4, 'smooth', 0.03);
  rod(b, [0, 2.7, 0.7], [0, 2.6, 0.72], 0.03, C.black, 4, 'smooth', 0.01);
  for (const s of [-1, 1]) blk(b, 0.03, 0.05, 0.05, C.black, s * 0.15, 2.88, 0.47);
};

// ============================================================ commercial

const counter: Builder = (b) => {
  const body = C.teal;
  blk(b, 7.8, 0.25, 2.2, C.charcoal, 0, 0, -0.1);
  blk(b, 8, 2.15, 2.2, body, 0, 0.25, -0.1);
  for (let i = 0; i < 4; i += 1) blk(b, 1.7, 1.0, 0.03, C.aqua, -2.85 + i * 1.9, 0.5, 1.01);
  blk(b, 8.02, 0.22, 0.04, C.cream, 0, 1.7, 1.02);
  blk(b, 8.1, 0.2, 2.4, 0xf5efe3, 0, 2.4, 0);
  // The register, mid-counter: screen to the staff (-Z), pole display to the customer (+Z).
  blk(b, 1.1, 0.25, 0.9, C.charcoal, 0, 2.6, -0.25);
  blk(b, 0.9, 0.06, 0.04, C.metal, 0, 2.7, 0.21);
  rod(b, [0, 2.85, -0.45], [0, 3.05, -0.5], 0.05, C.charcoal, 4);
  box(b, 0.95, 0.62, 0.08, C.charcoal, 0, 3.25, -0.5, 'smooth', { rx: 0.25 });
  box(b, 0.82, 0.5, 0.02, 0x2a6fd6, 0, 3.24, -0.555, 'glow', { rx: 0.25 });
  rod(b, [0.45, 2.85, 0.05], [0.45, 2.95, 0.05], 0.03, C.charcoal, 4);
  blk(b, 0.45, 0.22, 0.08, C.charcoal, 0.45, 2.95, 0.08);
  blk(b, 0.38, 0.15, 0.02, 0x3dff8a, 0.45, 2.98, 0.12, 'glow');
  box(b, 0.22, 0.32, 0.14, C.charcoal, 0.85, 2.72, 0.55, 'smooth', { rx: -0.35 });
  box(b, 0.15, 0.1, 0.02, 0x3fe0d0, 0.85, 2.8, 0.635, 'glow', { rx: -0.35 });
  blk(b, 0.35, 0.22, 0.35, C.white, -0.8, 2.6, -0.3);
  cyl(b, 0.18, 0.16, 0.35, 0xcfeffa, -1.5, 2.6, 0.5, 8);
  cyl(b, 0.14, 0.14, 0.1, C.sunny, -1.5, 2.6, 0.5, 6);
  blk(b, 0.9, 0.35, 0.6, C.white, 2.8, 2.6, 0.2);
  for (const [x, c] of [[2.55, C.pink], [2.8, C.sunny], [3.05, C.mint]] as const) blk(b, 0.2, 0.06, 0.45, c, x, 2.95, 0.2);
};

const shelf: Builder = (b) => {
  const palette = [C.coral, C.sunny, C.teal, C.pink, C.sky, C.orange, C.mint, C.lilac];
  blk(b, 8, 0.4, 2.2, C.white, 0, 0, 0);
  blk(b, 7.7, 5.6, 0.15, 0xcfe9f7, 0, 0.4, -1.0);
  for (const x of [-3.925, 3.925]) blk(b, 0.15, 6.0, 2.2, C.white, x, 0, 0);
  blk(b, 8, 0.45, 0.3, C.coral, 0, 5.55, -0.95);
  for (const y of [1.6, 2.8, 4.0]) blk(b, 7.7, 0.1, 2.0, C.white, 0, y, 0.05);
  [0.4, 1.7, 2.9, 4.1].forEach((y, row) => {
    for (let i = 0; i < 4; i += 1) {
      const c = palette[(row * 3 + i) % palette.length] ?? C.coral;
      blk(b, 1.65, 0.7 + ((row + i) % 3) * 0.15, 1.6, c, -2.85 + i * 1.9, y, 0.05);
    }
  });
};

const cooler: Builder = (b) => {
  const shell = C.white;
  blk(b, 6, 0.3, 2.3, C.charcoal, 0, 0, -0.05);
  blk(b, 5.6, 0.3, 2.2, shell, 0, 0.3, -0.05);
  for (const x of [-2.875, 2.875]) blk(b, 0.25, 6.1, 2.4, shell, x, 0.3, 0);
  blk(b, 5.6, 6.1, 0.2, shell, 0, 0.3, -1.1);
  blk(b, 6, 0.6, 2.4, C.teal, 0, 6.4, 0);
  blk(b, 4.5, 0.35, 0.04, 0x9ff7ff, 0, 6.52, 1.21, 'glow');
  blk(b, 5.5, 5.7, 0.04, 0xeefcff, 0, 0.6, -0.98, 'glow');
  const drinks = [C.red, C.orange, 0x3fbf5f, 0x3fa9ff, C.sunny, C.pink, 0x8b5cf6, C.aqua];
  [0.6, 1.66, 2.86, 4.06, 5.26].forEach((y, row) => {
    if (row > 0) blk(b, 5.5, 0.06, 1.8, C.steel, 0, y - 0.06, -0.1);
    for (let i = 0; i < 2; i += 1) blk(b, 2.6, 0.8, 1.2, drinks[(row * 2 + i) % drinks.length] ?? C.red, -1.35 + i * 2.7, y, -0.3);
  });
  for (const x of [-2.75, -0.92, 0.92, 2.75]) blk(b, 0.12, 5.9, 0.1, C.steel, x, 0.5, 1.15);
  for (const y of [0.5, 6.3]) blk(b, 5.6, 0.12, 0.1, C.steel, 0, y, 1.15);
  for (const x of [-1.83, 0, 1.83]) {
    blk(b, 0.08, 1.4, 0.1, C.chrome, x + 0.7, 2.6, 1.25);
    box(b, 0.12, 2.6, 0.01, 0xf6fdff, x - 0.2, 3.6, 1.2, 'glow', { rz: -0.35 });
  }
};

const clothesRack: Builder = (b) => {
  for (const x of [-2.3, 2.3]) {
    blk(b, 0.15, 0.1, 1.6, C.chrome, x, 0, 0);
    rod(b, [x, 0.1, 0], [x, 4.6, 0], 0.06, C.chrome, 6);
  }
  rod(b, [-2.4, 4.6, 0], [2.4, 4.6, 0], 0.05, C.chrome, 6);
  const shirts = [C.coral, C.teal, C.sunny, C.pink, C.sky, C.mint, C.lilac];
  shirts.forEach((c, i) => {
    const x = -1.8 + i * 0.6;
    const long = i % 3 === 1;
    box(b, 0.04, 0.04, 1.2, C.lightWood, x, 4.35, 0, 'smooth');
    blk(b, 0.05, 0.25, 0.05, C.chrome, x, 4.4, 0);
    blk(b, 0.14, long ? 2.5 : 1.8, 1.3, c, x, 4.35 - (long ? 2.5 : 1.8), 0);
  });
  blk(b, 1.0, 0.5, 0.06, C.white, 0, 4.75, 0);
};

const mannequin: Builder = (b) => {
  disc(b, 0.6, 0.1, C.chrome, 0, 0, 0, 8);
  rod(b, [0, 0.1, 0], [0, 2.1, 0], 0.06, C.chrome, 6);
  blk(b, 0.95, 0.55, 0.5, C.navy, 0, 2.05, 0);
  cyl(b, 0.52, 0.42, 1.25, C.coral, 0, 2.55, 0, 8, 'smooth', false, { sz: 0.6 });
  for (const [x, y, c] of [[-0.2, 3.3, C.leaf], [0.25, 2.9, C.sunny], [-0.1, 2.75, C.leaf]] as const) box(b, 0.25, 0.1, 0.02, c, x, y, 0.31, 'smooth', { rz: 0.6 });
  for (const s of [-1, 1]) {
    orb(b, 0.2, C.coral, s * 0.5, 3.6, 0, 6);
    rod(b, [s * 0.55, 3.55, 0], [s * 0.68, 2.6, 0.08], 0.1, C.white, 6, 'smooth', 0.08);
  }
  cyl(b, 0.12, 0.14, 0.25, C.white, 0, 3.78, 0, 6);
  orb(b, 0.27, C.white, 0, 4.0, 0, 6);
  blk(b, 0.42, 0.08, 0.06, C.black, 0, 4.02, 0.24);
  disc(b, 0.45, 0.04, C.sand, 0, 4.16, 0, 8);
  cyl(b, 0.22, 0.26, 0.2, C.coral, 0, 4.18, 0, 6);
};

const mirror: Builder = (b) => {
  const frame = C.peach;
  const gold = 0xe8b84a;
  blk(b, 3, 0.4, 0.6, gold, 0, 0, 0);
  blk(b, 3, 4.5, 0.2, frame, 0, 0.4, -0.05);
  b.add(new CylinderGeometry(1.5, 1.5, 0.2, 12, 1, false, Math.PI / 2, Math.PI), frame, 'smooth', { y: 4.9, z: -0.05, rx: Math.PI / 2 });
  blk(b, 2.5, 4.2, 0.05, 0xbfe7f5, 0, 0.7, 0.07);
  b.add(new CylinderGeometry(1.25, 1.25, 0.05, 12, 1, false, Math.PI / 2, Math.PI), 0xbfe7f5, 'smooth', { y: 4.9, z: 0.07, rx: Math.PI / 2 });
  box(b, 0.3, 3.6, 0.01, 0xeaf8ff, -0.5, 3.0, 0.1, 'glow', { rz: -0.45 });
  box(b, 0.12, 2.4, 0.01, 0xeaf8ff, 0.1, 3.3, 0.1, 'glow', { rz: -0.45 });
  badge(b, 0.15, 0.06, gold, 0, 6.15, 0.08, 8);
};

const boothBench = (b: B): void => {
  const vinyl = 0xe8584f;
  blk(b, 4.2, 1.0, 1.5, C.white, 0, 0, -2.55);
  blk(b, 4.0, 0.2, 1.4, vinyl, 0, 1.0, -2.5);
  blk(b, 4.2, 1.8, 0.5, C.white, 0, 1.2, -3.05);
  blk(b, 4.0, 1.4, 0.12, vinyl, 0, 1.35, -2.74);
  rod(b, [-2.1, 3.0, -3.05], [2.1, 3.0, -3.05], 0.07, C.chrome, 6);
  blk(b, 4.22, 0.08, 0.04, C.chrome, 0, 0.92, -1.79);
};

const booth: Builder = (b) => {
  boothBench(b);
  sub(b, { ry: Math.PI }, boothBench);
  disc(b, 0.6, 0.06, C.chrome, 0, 0, 0, 8);
  rod(b, [0, 0, 0], [0, 2.05, 0], 0.12, C.chrome, 6);
  blk(b, 4.05, 0.08, 2.25, C.chrome, 0, 2.02, 0);
  blk(b, 4.0, 0.1, 2.2, C.mint, 0, 2.1, 0);
  blk(b, 0.35, 0.35, 0.3, C.chrome, 1.6, 2.2, 0);
  for (const [z, c] of [[-0.35, C.red], [0.35, C.sunny]] as const) {
    cyl(b, 0.1, 0.11, 0.42, c, 1.6, 2.2, z, 6);
    cyl(b, 0.03, 0.06, 0.08, c, 1.6, 2.62, z, 6);
  }
};

const cafeTable: Builder = (b) => {
  disc(b, 0.7, 0.08, C.charcoal, 0, 0, 0, 8);
  rod(b, [0, 0.05, 0], [0, 2.05, 0], 0.09, C.charcoal, 6);
  disc(b, 1.32, 0.06, 0xe8b84a, 0, 2.02, 0, 12);
  disc(b, 1.3, 0.12, 0xf6f3ee, 0, 2.08, 0, 12);
  for (const [x, z, c] of [[-0.5, 0.4, C.white], [0.55, -0.3, C.coral]] as const) {
    disc(b, 0.22, 0.03, C.white, x, 2.2, z, 8);
    cyl(b, 0.13, 0.1, 0.22, c, x, 2.23, z, 6);
  }
  cyl(b, 0.08, 0.1, 0.3, C.teal, 0, 2.2, -0.1, 6);
  gem(b, 0.12, C.pink, 0, 2.6, -0.1, 'smooth');
};

const coffeeMachine: Builder = (b) => {
  blk(b, 2.6, 2.6, 2.0, C.coral, 0, 0, 0);
  for (const x of [-0.64, 0.64]) {
    blk(b, 1.2, 2.2, 0.04, shade(C.coral, 1.08), x, 0.2, 1.01);
    blk(b, 0.06, 0.4, 0.06, C.chrome, x * 0.25, 1.7, 1.05);
  }
  blk(b, 2.65, 0.12, 2.05, C.white, 0, 2.6, 0);
  blk(b, 2.2, 1.2, 1.2, C.chrome, 0, 2.72, -0.3);
  blk(b, 2.22, 0.18, 1.22, C.coral, 0, 3.4, -0.3);
  blk(b, 2.2, 0.08, 1.2, C.steel, 0, 3.92, -0.3);
  for (const x of [-0.6, -0.2]) cyl(b, 0.13, 0.1, 0.2, x > -0.3 ? C.coral : C.white, x, 4.0, -0.3, 6);
  blk(b, 2.0, 0.08, 0.55, C.charcoal, 0, 2.72, 0.55);
  for (const x of [-0.5, 0.5]) {
    cyl(b, 0.16, 0.16, 0.2, C.metal, x, 3.12, 0.4, 6);
    rod(b, [x, 3.05, 0.4], [x, 3.0, 0.98], 0.05, C.black, 4);
    cyl(b, 0.12, 0.1, 0.2, C.white, x, 2.8, 0.45, 6);
  }
  rod(b, [0.95, 3.35, 0.3], [1.0, 2.9, 0.55], 0.03, C.chrome, 4);
  badge(b, 0.2, 0.05, C.chrome, 0, 3.6, 0.32, 8);
  badge(b, 0.15, 0.02, C.warm, 0, 3.6, 0.35, 8, 'glow');
};

const fryer: Builder = (b) => {
  blk(b, 2.6, 2.6, 2.3, C.steel, 0, 0, -0.05);
  for (const x of [-0.64, 0.64]) {
    blk(b, 1.2, 1.9, 0.04, C.chrome, x, 0.3, 1.11);
    blk(b, 0.5, 0.06, 0.06, C.charcoal, x, 2.0, 1.15);
  }
  blk(b, 2.6, 0.1, 2.3, C.chrome, 0, 2.6, -0.05);
  for (const x of [-0.62, 0.62]) blk(b, 1.05, 0.03, 1.4, 0xd99a2b, x, 2.69, 0.0);
  blk(b, 0.9, 0.35, 0.9, C.metal, -0.62, 2.55, 0.0);
  blk(b, 0.9, 0.35, 0.9, C.metal, 0.62, 2.95, -0.55);
  for (let i = 0; i < 5; i += 1) box(b, 0.1, 0.1, 0.7, 0xffd166, 0.35 + i * 0.13, 3.33, -0.55, 'smooth', { ry: (i - 2) * 0.25 });
  rod(b, [-0.62, 2.8, 0.45], [-0.62, 2.85, 1.15], 0.05, C.black, 4);
  rod(b, [0.62, 3.1, -0.1], [0.62, 3.0, 0.6], 0.05, C.black, 4);
  blk(b, 2.6, 0.6, 0.12, C.chrome, 0, 2.6, -1.14);
  blk(b, 0.7, 0.25, 0.02, 0x101418, 0, 2.85, -1.07);
  blk(b, 0.55, 0.15, 0.01, 0xff4f3a, 0, 2.9, -1.06, 'glow');
  for (const x of [-0.9, 0.9]) badge(b, 0.08, 0.08, C.black, x, 2.4, 1.13, 6);
};

const grill: Builder = (b) => {
  blk(b, 3.2, 2.3, 2.2, C.steel, 0, 0, -0.1);
  for (const x of [-0.8, 0.8]) blk(b, 1.45, 1.6, 0.04, C.chrome, x, 0.25, 1.01);
  blk(b, 3.2, 0.3, 0.06, C.metal, 0, 2.0, 1.02);
  for (let i = 0; i < 4; i += 1) blk(b, 0.16, 0.16, 0.1, C.black, -1.2 + i * 0.8, 2.07, 1.07);
  blk(b, 3.0, 0.1, 0.25, C.metal, 0, 2.3, 1.05);
  blk(b, 3.2, 0.12, 2.2, C.black, 0, 2.3, -0.1);
  blk(b, 3.2, 0.7, 0.1, C.chrome, 0, 2.42, -1.15);
  for (const x of [-1.55, 1.55]) blk(b, 0.1, 0.4, 2.2, C.chrome, x, 2.42, -0.1);
  for (const [x, z] of [[-0.8, 0.2], [0, 0.3], [0.8, 0.1], [-0.4, -0.5]] as const) disc(b, 0.3, 0.09, 0x6b3b22, x, 2.42, z, 6);
  blk(b, 0.48, 0.03, 0.48, 0xffcc33, 0, 2.51, 0.3, 'smooth', { ry: 0.4 });
  for (const x of [0.65, 1.15]) orb(b, 0.24, 0xe0a458, x, 2.45, -0.55, 6, 'smooth', [1, 0.45, 1]);
  blk(b, 0.35, 0.02, 0.4, C.chrome, -0.2, 2.44, 0.75, 'smooth', { ry: 0.3 });
  rod(b, [-0.13, 2.47, 0.95], [0.0, 2.55, 1.3], 0.04, C.black, 4);
};

const sodaFountain: Builder = (b) => {
  blk(b, 2.4, 2.3, 2.0, C.red, 0, 0, 0);
  blk(b, 2.42, 0.2, 2.02, C.white, 0, 1.6, 0);
  blk(b, 2.45, 0.1, 2.05, C.white, 0, 2.3, 0);
  blk(b, 1.7, 1.9, 1.0, C.white, 0, 2.4, -0.45);
  const brands = [0xe5484d, C.orange, 0x3fbf5f, 0x8b5cf6];
  brands.forEach((c, i) => blk(b, 0.38, 0.85, 0.04, c, -0.6 + i * 0.4, 3.3, 0.07, 'glow'));
  for (let i = 0; i < 4; i += 1) {
    blk(b, 0.16, 0.22, 0.2, C.chrome, -0.6 + i * 0.4, 3.0, 0.15);
    blk(b, 0.06, 0.15, 0.12, C.black, -0.6 + i * 0.4, 2.88, 0.3);
  }
  blk(b, 1.7, 0.08, 0.6, C.charcoal, 0, 2.4, 0.35);
  blk(b, 1.8, 0.12, 1.1, C.red, 0, 4.28, -0.45);
  for (let i = 0; i < 5; i += 1) cyl(b, 0.15, 0.12, 0.2, C.white, 1.0, 2.4 + i * 0.17, 0.6, 6);
};

const displayCase: Builder = (b) => {
  const body = C.pink;
  blk(b, 4, 1.6, 2.2, body, 0, 0, 0);
  blk(b, 4.02, 0.15, 0.04, C.cream, 0, 1.3, 1.11);
  blk(b, 4.02, 0.2, 0.04, C.cream, 0, 0.1, 1.11);
  blk(b, 3.8, 1.85, 0.1, C.warm, 0, 1.6, -1.0, 'glow');
  blk(b, 3.9, 0.06, 2.0, C.white, 0, 1.6, 0);
  blk(b, 3.8, 0.04, 1.4, 0xd8f2fb, 0, 2.5, -0.25);
  for (const x of [-1.95, 1.95]) blk(b, 0.06, 1.9, 2.0, 0xd8f2fb, x, 1.6, 0);
  blk(b, 4, 0.1, 1.5, 0xd8f2fb, 0, 3.5, -0.3);
  beam(b, [-1.97, 1.66, 1.05], [-1.97, 3.52, 0.45], 0.08, 0.08, C.chrome);
  beam(b, [1.97, 1.66, 1.05], [1.97, 3.52, 0.45], 0.08, 0.08, C.chrome);
  blk(b, 4, 0.08, 0.1, C.chrome, 0, 3.48, 0.45);
  beam(b, [-1.0, 1.75, 1.02], [-0.6, 3.4, 0.48], 0.12, 0.01, 0xf6fdff, 'glow');
  const pastries: readonly (readonly [number, number, number, number])[] = [
    [-1.4, 1.66, 0.4, C.pink], [-0.5, 1.66, 0.3, 0xe0a458], [0.4, 1.66, 0.5, C.white], [1.3, 1.66, 0.3, 0x8a5a36],
    [-1.2, 2.54, -0.3, C.sunny], [-0.2, 2.54, -0.2, C.lilac], [0.9, 2.54, -0.3, 0xe0a458],
  ];
  for (const [x, y, z, c] of pastries) gem(b, 0.3, c, x, y + 0.15, z, 'smooth', [1.2, 0.55, 1.1]);
  for (const x of [-1.4, -0.5, 0.4, 1.3]) blk(b, 0.25, 0.12, 0.03, C.white, x, 1.66, 0.95);
};

const hospitalBed: Builder = (b) => {
  const rail = 0x8fa3b0;
  for (const x of [-1.1, 1.1]) for (const z of [-2.6, 2.6]) {
    rod(b, [x, 0.25, z], [x, 0.55, z], 0.06, C.metal, 4);
    blk(b, 0.12, 0.28, 0.28, C.black, x, 0, z);
  }
  blk(b, 2.6, 0.3, 5.8, C.steel, 0, 0.55, 0);
  blk(b, 2.4, 0.33, 5.6, C.white, 0, 0.85, 0);
  blk(b, 2.6, 0.45, 5.8, C.white, 0, 1.18, 0);
  blk(b, 2.65, 0.07, 3.4, 0x9fd6f0, 0, 1.63, 1.1);
  blk(b, 2.65, 0.08, 0.4, C.white, 0, 1.63, -0.62);
  box(b, 1.5, 0.3, 0.8, C.white, 0, 1.78, -2.4, 'smooth', { rx: -0.2 });
  blk(b, 2.8, 2.3, 0.2, C.cream, 0, 0.5, -3.1);
  blk(b, 2.2, 1.0, 0.04, C.teal, 0, 1.6, -2.99);
  blk(b, 2.8, 1.5, 0.2, C.cream, 0, 0.5, 3.1);
  blk(b, 2.2, 0.5, 0.04, C.teal, 0, 1.2, 3.21);
  blk(b, 0.5, 0.6, 0.04, C.white, 0.7, 1.3, 3.23);
  for (const sx of [-1, 1]) {
    const x = sx * 1.42;
    rod(b, [x, 2.15, -2.6], [x, 2.15, -0.4], 0.05, rail, 4);
    rod(b, [x, 1.85, -2.6], [x, 1.85, -0.4], 0.04, rail, 4);
    for (const z of [-2.4, -0.6]) rod(b, [x, 1.4, z], [x, 2.15, z], 0.04, rail, 4);
  }
  blk(b, 0.3, 0.5, 0.12, C.charcoal, 1.42, 1.5, 0.4);
};

const heartMonitor: Builder = (b) => {
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    box(b, 0.12, 0.1, 0.6, C.steel, Math.sin(a) * 0.3, 0.18, Math.cos(a) * 0.3, 'smooth', { ry: a });
    blk(b, 0.14, 0.13, 0.14, C.black, Math.sin(a) * 0.58, 0, Math.cos(a) * 0.58);
  }
  rod(b, [0, 0.2, 0], [0, 3.6, 0], 0.06, C.steel, 6);
  blk(b, 0.8, 0.3, 0.4, C.steel, 0, 2.4, 0);
  blk(b, 1.3, 1.0, 0.6, 0xe6edf1, 0, 3.6, 0);
  blk(b, 1.1, 0.75, 0.02, 0x0b2a1e, 0, 3.72, 0.31, 'glow');
  const pts: readonly (readonly [number, number])[] = [[-0.5, 4.05], [-0.2, 4.05], [-0.1, 4.3], [0.0, 3.85], [0.1, 4.05], [0.45, 4.05]];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p = pts[i]!;
    const q = pts[i + 1]!;
    beam(b, [p[0], p[1], 0.33], [q[0], q[1], 0.33], 0.04, 0.01, 0x3dff8a, 'glow', 0.04);
  }
  blk(b, 0.3, 0.14, 0.01, 0x3fe0ff, -0.3, 3.82, 0.33, 'glow');
  blk(b, 0.25, 0.14, 0.01, C.sunny, 0.3, 3.82, 0.33, 'glow');
  rod(b, [-0.4, 4.6, 0], [0.4, 4.6, 0], 0.05, C.steel, 4);
  for (const x of [-0.4, 0.4]) rod(b, [x, 4.6, 0], [x, 4.85, 0], 0.04, C.steel, 4);
  rod(b, [-0.4, 4.85, 0], [0.4, 4.85, 0], 0.04, C.steel, 4);
};

// ------------------------------------------------------- service desks

interface DeskStyle {
  readonly body: number;
  readonly accent: number;
  readonly top: number;
  readonly monitors: readonly number[];
  readonly extra?: (b: B, ledgeY: number, ledgeZ: number) => void;
}

/** A service desk: customers on +Z (a raised transaction ledge when h >= 2.95), staff on -Z with monitors facing them. */
const serviceDesk = (b: B, w: number, d: number, h: number, s: DeskStyle): void => {
  const ledge = h >= 2.95;
  const work = ledge ? 2.3 : h;
  const front = ledge ? h - 0.15 : work - 0.12;
  blk(b, w - 0.4, 0.12, d - 0.55, s.top, 0, work - 0.12, -0.25);
  for (const sx of [-1, 1]) blk(b, 0.2, work - 0.12, d, s.body, sx * (w / 2 - 0.1), 0, 0);
  blk(b, w, front, 0.35, s.body, 0, 0, d / 2 - 0.175);
  blk(b, w - 0.1, 0.2, 0.05, shade(s.body, 0.6), 0, 0, d / 2 + 0.01);
  blk(b, w + 0.02, 0.22, 0.05, s.accent, 0, front * 0.68, d / 2 + 0.02);
  badge(b, 0.42, 0.06, s.accent, 0, front * 0.38, d / 2 + 0.03, 10);
  badge(b, 0.26, 0.04, C.white, 0, front * 0.38, d / 2 + 0.07, 8);
  const ledgeZ = d / 2 - 0.3;
  if (ledge) blk(b, w + 0.1, 0.15, 0.8, s.top, 0, h - 0.15, ledgeZ);
  else blk(b, w + 0.05, 0.08, d + 0.05, s.top, 0, h - 0.08, 0);
  const ledgeY = ledge ? h : h;
  for (const x of s.monitors) {
    blk(b, 0.5, 0.04, 0.35, C.charcoal, x, work, -0.4);
    blk(b, 0.1, 0.35, 0.1, C.charcoal, x, work, -0.4);
    blk(b, 1.1, 0.62, 0.08, C.charcoal, x, work + 0.3, -0.38);
    blk(b, 0.98, 0.5, 0.02, 0x2a6fd6, x, work + 0.36, -0.43, 'glow');
    blk(b, 0.9, 0.04, 0.3, C.charcoal, x, work, -0.95);
  }
  s.extra?.(b, ledgeY, ledgeZ);
};

const reception: Builder = (b) => serviceDesk(b, 8, 2.6, 3.2, {
  body: 0xf4f7f8, accent: C.teal, top: 0xdfe9ee, monitors: [-2, 2],
  extra: (s, y, z) => {
    orb(s, 0.15, 0xe8b84a, 0.8, y + 0.02, z, 6, 'smooth', [1, 0.7, 1]);
    cyl(s, 0.16, 0.2, 0.4, C.teal, -2.8, y, z, 6);
    for (const [dx, c] of [[0, C.pink], [0.15, C.sunny], [-0.14, C.coral]] as const) gem(s, 0.16, c, -2.8 + dx, y + 0.6, z, 'smooth');
  },
});

const jobDesk: Builder = (b) => serviceDesk(b, 8, 2.6, 3.2, {
  body: C.cream, accent: C.coral, top: 0xffe6a8, monitors: [-2.2, 0.4, 2.6],
  extra: (s, y, z) => {
    for (let i = 0; i < 3; i += 1) blk(s, 0.8, 0.05, 0.6, C.white, -1.0, y + i * 0.05, z, 'smooth', { ry: i * 0.12 });
    blk(s, 0.06, 0.5, 0.06, C.charcoal, 1.6, y, z);
    blk(s, 0.9, 0.5, 0.06, C.sunny, 1.6, y + 0.5, z, 'glow');
  },
});

const policeDesk: Builder = (b) => serviceDesk(b, 5, 2.4, 2.6, {
  body: C.navy, accent: 0xe8b84a, top: 0xdde3ea, monitors: [-1],
  extra: (s, y, z) => {
    blk(s, 0.7, 0.05, 0.5, C.white, 0.8, y, z - 0.6, 'smooth', { ry: 0.2 });
    cyl(s, 0.12, 0.1, 0.25, C.white, 1.6, y, z - 0.4, 6);
    rod(s, [1.9, y, -0.6], [1.9, y + 0.7, -0.8], 0.04, C.charcoal, 4);
    cyl(s, 0.08, 0.25, 0.25, C.charcoal, 1.9, y + 0.55, -0.6, 6);
  },
});

const jailDesk: Builder = (b) => serviceDesk(b, 5, 2.4, 3.2, {
  body: 0x3a4a60, accent: C.orange, top: 0xc9d1da, monitors: [-1.2],
  extra: (s, y, z) => {
    blk(s, 0.5, 0.06, 0.35, C.black, 0.6, y, z);
    blk(s, 0.15, 0.3, 0.15, C.red, 1.2, y, z);
    blk(s, 0.6, 0.04, 0.8, 0x8a5a36, -0.4, y, z, 'smooth', { ry: -0.2 });
  },
});

const dealerDesk: Builder = (b) => serviceDesk(b, 5, 2.4, 3.0, {
  body: C.white, accent: C.red, top: C.chrome, monitors: [-1.3],
  extra: (s, y, z) => {
    blk(s, 0.8, 0.22, 0.38, C.red, 0.8, y + 0.08, z);
    blk(s, 0.42, 0.16, 0.34, 0x9fd6f0, 0.75, y + 0.3, z);
    for (const x of [0.55, 1.05]) for (const dz of [-0.2, 0.2]) cyl(s, 0.08, 0.08, 0.06, C.black, x, y, z + dz, 6, 'smooth', false, { rx: Math.PI / 2, y: y + 0.09 });
    blk(s, 0.12, 0.25, 0.04, C.charcoal, -0.4, y, z);
  },
});

const depotDesk: Builder = (b) => serviceDesk(b, 8, 2.6, 3.2, {
  body: C.orange, accent: C.darkWood, top: 0xf0e2c8, monitors: [-2.4, 2.4],
  extra: (s, y, z) => {
    blk(s, 0.7, 0.5, 0.6, 0xc8955c, -0.8, y, z, 'smooth', { ry: 0.2 });
    blk(s, 0.5, 0.35, 0.5, 0xd6a96f, -0.8, y + 0.5, z, 'smooth', { ry: -0.15 });
    blk(s, 0.25, 0.02, 0.6, 0xe8c48a, -0.8, y + 0.5, z, 'smooth', { ry: 0.2 });
    blk(s, 0.8, 0.1, 0.6, C.steel, 1.0, y, z);
    blk(s, 0.3, 0.15, 0.04, 0x3dff8a, 1.0, y + 0.1, z + 0.3, 'glow');
  },
});

const hangarDesk: Builder = (b) => serviceDesk(b, 5, 2.4, 3.2, {
  body: C.sky, accent: C.navy, top: C.white, monitors: [-1.3],
  extra: (s, y, z) => {
    rod(s, [0.2, y + 0.45, z], [1.4, y + 0.45, z], 0.09, C.white, 6, 'smooth', 0.05);
    blk(s, 0.35, 0.03, 1.2, C.white, 0.75, y + 0.43, z);
    blk(s, 0.05, 0.25, 0.25, C.coral, 1.35, y + 0.47, z);
    rod(s, [0.75, y, z], [0.75, y + 0.42, z], 0.03, C.charcoal, 4);
    orb(s, 0.25, C.teal, -0.5, y + 0.4, z, 6);
    rod(s, [-0.5, y, z], [-0.5, y + 0.15, z], 0.05, C.charcoal, 4);
  },
});

const bars: Builder = (b) => {
  const metal = 0x5c6670;
  blk(b, 10, 0.4, 0.5, metal, 0, 8.1, 0);
  blk(b, 10, 0.2, 0.5, metal, 0, 0, 0);
  blk(b, 10, 0.2, 0.3, metal, 0, 4.0, 0);
  for (let i = 0; i < 19; i += 1) {
    const x = -4.5 + i * 0.5;
    const post = Math.abs(x - 1.5) < 0.01 || Math.abs(x - 3.5) < 0.01;
    blk(b, post ? 0.24 : 0.12, 7.9, post ? 0.3 : 0.12, metal, x, 0.2, 0);
  }
  for (const x of [-5, 5]) blk(b, 0.2, 8.5, 0.5, metal, x === -5 ? -4.9 : 4.9, 0, 0);
  blk(b, 0.5, 0.7, 0.4, C.charcoal, 3.2, 3.6, 0);
  blk(b, 0.12, 0.2, 0.02, 0xe8b84a, 3.2, 3.85, 0.21);
};

const locker: Builder = (b) => {
  blk(b, 4, 0.3, 1.5, C.charcoal, 0, 0, 0);
  blk(b, 4, 6.6, 1.6, 0x5aa9d6, 0, 0.3, 0);
  blk(b, 4.05, 0.1, 1.65, 0x4b8fb8, 0, 6.9, 0);
  [-1.32, 0, 1.32].forEach((x, i) => {
    blk(b, 1.25, 6.3, 0.05, i % 2 ? 0x3fb7b0 : 0x6cb8e4, x, 0.45, 0.81);
    for (const y of [5.9, 6.2]) blk(b, 0.8, 0.06, 0.02, C.charcoal, x, y, 0.84);
    blk(b, 0.08, 0.6, 0.08, C.chrome, x + 0.45, 3.2, 0.86);
    blk(b, 0.3, 0.18, 0.02, C.white, x, 5.4, 0.84);
  });
};

const atm: Builder = (b) => {
  const body = 0x24364f;
  blk(b, 2.2, 4.6, 1.6, body, 0, 0, 0);
  for (const x of [-1.11, 1.11]) blk(b, 0.02, 4.6, 0.25, C.teal, x, 0, 0.5);
  blk(b, 2.2, 0.4, 1.6, C.teal, 0, 4.6, 0);
  blk(b, 2.0, 0.3, 0.04, 0x3fe0d0, 0, 4.65, 0.81, 'glow');
  blk(b, 1.8, 2.3, 0.06, 0xc9d1da, 0, 2.0, 0.81);
  box(b, 1.15, 0.85, 0.06, C.black, 0, 3.6, 0.85, 'smooth', { rx: -0.15 });
  box(b, 1.0, 0.7, 0.02, 0x3a8dff, 0, 3.6, 0.89, 'glow', { rx: -0.15 });
  blk(b, 1.5, 0.12, 0.55, body, 0, 4.12, 0.98);
  box(b, 1.4, 0.12, 0.5, C.charcoal, 0, 2.62, 0.98, 'smooth', { rx: 0.3 });
  for (let r = 0; r < 4; r += 1) box(b, 0.7, 0.05, 0.08, C.steel, -0.2, 2.72 - r * 0.033, 0.86 + r * 0.1, 'smooth', { rx: 0.3 });
  box(b, 0.22, 0.05, 0.1, 0x3fbf5f, 0.42, 2.71, 0.9, 'smooth', { rx: 0.3 });
  box(b, 0.22, 0.05, 0.1, C.red, 0.42, 2.67, 1.04, 'smooth', { rx: 0.3 });
  blk(b, 0.4, 0.08, 0.04, 0x3dff8a, 0.6, 3.05, 0.85, 'glow');
  blk(b, 1.0, 0.1, 0.05, C.black, 0, 2.2, 0.85);
};

const vending: Builder = (b) => {
  const body = C.coral;
  for (const x of [-1.1, 1.1]) for (const z of [-0.8, 0.8]) blk(b, 0.2, 0.2, 0.2, C.charcoal, x, 0, z);
  blk(b, 2.6, 5.4, 2, body, 0, 0.2, 0);
  blk(b, 1.75, 4.0, 0.04, 0xf0fbff, -0.35, 1.3, 1.01, 'glow');
  const snacks = [C.red, C.sunny, 0x3fa9ff, 0x3fbf5f, C.orange, C.lilac];
  for (let r = 0; r < 4; r += 1) {
    blk(b, 1.7, 0.05, 0.1, C.steel, -0.35, 1.45 + r * 0.95, 1.06);
    for (let i = 0; i < 3; i += 1) blk(b, 0.42, 0.55, 0.12, snacks[(r + i * 2) % snacks.length] ?? C.red, -0.9 + i * 0.55, 1.5 + r * 0.95, 1.05);
  }
  blk(b, 0.6, 1.5, 0.05, C.charcoal, 0.95, 2.7, 1.01);
  blk(b, 0.45, 0.2, 0.02, 0x3dff8a, 0.95, 3.9, 1.04, 'glow');
  for (let r = 0; r < 3; r += 1) blk(b, 0.4, 0.1, 0.03, C.steel, 0.95, 3.2 - r * 0.2, 1.04);
  blk(b, 0.1, 0.25, 0.03, C.sunny, 0.95, 2.8, 1.04);
  blk(b, 1.6, 0.5, 0.06, C.black, -0.35, 0.5, 1.02);
  blk(b, 2.4, 0.5, 0.04, C.lemon, 0, 4.85, 1.01, 'glow');
};

const gasPump: Builder = (b) => {
  blk(b, 2.4, 0.3, 1.6, 0xdcdcd4, 0, 0, 0);
  blk(b, 2.42, 0.1, 1.62, C.sunny, 0, 0.2, 0);
  blk(b, 1.8, 3.6, 1.0, C.white, 0, 0.3, 0);
  blk(b, 1.82, 1.2, 1.02, C.teal, 0, 0.3, 0);
  blk(b, 2.0, 0.9, 1.2, C.teal, 0, 3.9, 0);
  blk(b, 2.0, 0.2, 1.22, 0xbff7f2, 0, 4.8, 0, 'glow');
  blk(b, 0.95, 0.55, 0.03, 0x173a73, 0, 2.9, 0.51, 'glow');
  blk(b, 0.6, 0.12, 0.02, 0x3dff8a, 0, 3.15, 0.53, 'glow');
  blk(b, 0.5, 0.45, 0.04, C.steel, 0, 2.2, 0.51);
  [C.sunny, 0x3fbf5f, C.orange].forEach((c, i) => blk(b, 0.22, 0.14, 0.04, c, -0.35 + i * 0.35, 1.85, 0.52, 'glow'));
  blk(b, 0.22, 0.6, 0.4, C.charcoal, 1.0, 1.9, 0.15);
  blk(b, 0.16, 0.5, 0.18, C.black, 1.12, 2.15, 0.25, 'smooth', { rz: -0.15 });
  rod(b, [1.12, 2.4, 0.25], [1.2, 2.75, 0.4], 0.05, C.black, 4);
  rod(b, [0.9, 3.6, 0.0], [1.3, 2.2, 0.0], 0.06, C.black, 4);
  rod(b, [1.3, 2.2, 0.0], [1.25, 1.2, 0.1], 0.06, C.black, 4);
  rod(b, [1.25, 1.2, 0.1], [1.15, 1.95, 0.2], 0.06, C.black, 4);
};

const displayPad: Builder = (b) => {
  cyl(b, 6, 6, 0.3, C.charcoal, 0, 0, 0, 16);
  cyl(b, 5.8, 5.8, 0.1, 0xd9dee4, 0, 0.3, 0, 16);
  ring(b, 5.95, 0.06, C.aqua, { y: 0.32, rx: Math.PI / 2 }, 'glow', 24, 3);
  disc(b, 1.2, 0.02, C.teal, 0, 0.4, 0, 12);
};

const crateBox = (b: B, x: number, z: number, y0: number, w: number, h: number, d: number, ry: number, c: number, label: boolean): void => {
  blk(b, w, h, d, c, x, y0, z, 'smooth', { ry });
  blk(b, w * 0.25, 0.02, d + 0.02, 0xe8c48a, x, y0 + h, z, 'smooth', { ry });
  if (label) blk(b, w * 0.35, h * 0.3, 0.02, C.white, x + Math.sin(ry) * (d / 2 + 0.01), y0 + h * 0.55, z + Math.cos(ry) * (d / 2 + 0.01), 'smooth', { ry });
};

const crateStack: Builder = (b) => {
  const card = [0xc8955c, 0xd6a96f, 0xb98447];
  crateBox(b, -1.0, -1.0, 0, 1.9, 1.5, 1.9, 0.05, card[0]!, false);
  crateBox(b, 1.0, -0.95, 0, 1.9, 1.5, 1.95, -0.04, card[1]!, true);
  crateBox(b, -0.95, 1.0, 0, 1.95, 1.5, 1.85, 0.03, card[2]!, true);
  crateBox(b, 1.0, 1.0, 0, 1.85, 1.5, 1.9, -0.06, card[0]!, true);
  crateBox(b, -0.5, -0.4, 1.5, 2.4, 1.4, 2.2, 0.1, card[1]!, false);
  crateBox(b, 1.05, 0.85, 1.5, 1.6, 1.2, 1.6, -0.2, card[2]!, true);
  crateBox(b, -0.3, -0.3, 2.9, 1.6, 1.5, 1.5, 0.3, card[0]!, true);
};

const pallet: Builder = (b) => {
  const wood = 0xd2b07c;
  for (const z of [-1.6, 0, 1.6]) blk(b, 4, 0.1, 0.6, wood, 0, 0, z);
  for (const x of [-1.7, 0, 1.7]) blk(b, 0.5, 0.3, 4, shade(wood, 0.9), x, 0.1, 0);
  for (let i = 0; i < 5; i += 1) blk(b, 4, 0.1, 0.65, wood, 0, 0.4, -1.65 + i * 0.825);
  const card = [0xc8955c, 0xd6a96f];
  for (const x of [-1, 1]) for (const z of [-1, 1]) crateBox(b, x, z, 0.5, 1.9, 1.2, 1.9, 0, card[(x + z + 2) % 2 === 0 ? 0 : 1]!, z > 0);
  crateBox(b, -0.95, 0, 1.7, 1.9, 1.3, 3.6, 0, card[1]!, false);
  crateBox(b, 0.95, 0, 1.7, 1.9, 1.3, 3.6, 0, card[0]!, false);
  blk(b, 4.02, 0.1, 0.06, 0x3fa9ff, 0, 1.4, 1.99);
};

const boatKiosk: Builder = (b) => {
  const wall = 0x7fd8cf;
  blk(b, 5, 0.3, 4, 0xc49a6c, 0, 0, 0);
  blk(b, 4.6, 3.6, 0.25, wall, 0, 0.3, -1.65);
  for (const x of [-2.175, 2.175]) blk(b, 0.25, 3.6, 3.0, wall, x, 0.3, -0.3);
  blk(b, 4.6, 1.6, 0.3, wall, 0, 0.3, 1.05);
  for (const x of [-1.5, 0, 1.5]) blk(b, 0.12, 1.6, 0.04, C.white, x, 0.3, 1.22);
  blk(b, 4.9, 0.12, 0.7, C.lightWood, 0, 1.9, 1.1);
  blk(b, 4.6, 0.7, 0.3, C.white, 0, 3.2, 1.05);
  blk(b, 5.0, 0.25, 4.0, C.white, 0, 3.9, -0.1);
  for (let i = 0; i < 6; i += 1) {
    const x = -2.5 + (i + 0.5) * (5 / 6);
    beam(b, [x, 3.8, 1.2], [x, 3.2, 1.95], 5 / 6, 0.06, i % 2 ? C.white : C.coral, 'leaf');
  }
  blk(b, 3.6, 1.0, 0.2, C.teal, 0, 4.15, 0.4);
  blk(b, 3.7, 0.08, 0.22, C.lemon, 0, 4.15, 0.4, 'glow');
  badge(b, 0.35, 0.06, C.white, -1.3, 4.65, 0.52, 8);
  rod(b, [1.9, 4.15, -1.5], [1.9, 6.0, -1.5], 0.05, C.white, 4);
  box(b, 0.04, 0.45, 0.8, C.coral, 1.9, 5.7, -1.1, 'leaf');
  for (const sx of [-1, 1]) ring(b, 0.45, 0.12, C.orange, { x: sx * 2.36, y: 2.4, z: -0.3, ry: Math.PI / 2 });
  ring(b, 0.4, 0.11, C.white, { x: -1.6, y: 1.0, z: 1.28 });
  for (const s of [-1, 1]) blk(b, 0.1, 0.1, 0.22, C.red, -1.6 + s * 0.4, 0.95, 1.28);
  blk(b, 0.5, 0.35, 0.3, C.white, 1.2, 2.02, 1.1);
  for (const dz of [-0.25, 0.25]) {
    rod(b, [2.45, 0.3, 0.4 + dz], [2.45, 2.8, 0.1 + dz], 0.05, C.lightWood, 4);
    box(b, 0.06, 0.7, 0.3, C.coral, 2.45, 0.6, 0.38 + dz, 'smooth', { rx: 0.12 });
  }
};

const firePole: Builder = (b) => {
  disc(b, 0.3, 0.08, C.red, 0, 0, 0, 10);
  rod(b, [0, 0, 0], [0, 9, 0], 0.1, 0xe8c26a, 8, 'smooth', 0.1, true);
  cyl(b, 0.25, 0.25, 0.15, C.red, 0, 8.85, 0, 8);
};

const treadmill: Builder = (b) => {
  blk(b, 2.0, 0.4, 4.4, C.charcoal, 0, 0, -0.3);
  blk(b, 1.6, 0.06, 4.2, C.black, 0, 0.4, -0.3);
  for (const x of [-0.9, 0.9]) blk(b, 0.2, 0.1, 4.2, C.steel, x, 0.4, -0.3);
  blk(b, 2.0, 0.55, 0.6, C.teal, 0, 0, 2.2);
  for (const x of [-1.0, 1.0]) {
    beam(b, [x, 0.4, 2.2], [x, 3.0, 1.9], 0.18, 0.18, C.charcoal);
    rod(b, [x * 1.05, 2.6, 1.9], [x * 1.05, 2.6, 0.9], 0.05, C.steel, 4);
  }
  box(b, 2.2, 0.6, 0.5, C.charcoal, 0, 3.2, 1.95, 'smooth', { rx: 0.35 });
  box(b, 1.2, 0.36, 0.02, 0x2a6fd6, 0, 3.29, 1.7, 'glow', { rx: 0.35 });
  box(b, 0.4, 0.12, 0.02, C.orange, 0.8, 3.29, 1.7, 'glow', { rx: 0.35 });
};

// ========================================================= street & parks

const bench: Builder = (b) => {
  const iron = 0x2a6f6a;
  const slat = 0xc98d55;
  for (const x of [-2.3, 0, 2.3]) {
    const end = x !== 0;
    blk(b, 0.15, 1.0, 0.2, iron, x, 0, 0.72);
    beam(b, [x, 0, -0.72], [x, end ? 2.55 : 2.3, -0.88], 0.15, 0.2, iron);
    blk(b, 0.15, 0.12, 1.6, iron, x, 0.94, 0.05);
    if (end) {
      beam(b, [x, 1.75, -0.75], [x, 1.75, 0.82], 0.15, 0.12, iron);
      rod(b, [x, 1.05, 0.72], [x, 1.72, 0.75], 0.05, iron, 4);
    }
  }
  for (const z of [-0.45, -0.05, 0.35, 0.75]) blk(b, 4.8, 0.1, 0.36, slat, 0, 1.1, z);
  for (let i = 0; i < 3; i += 1) {
    const t = 0.18 + i * 0.32;
    box(b, 4.8, 0.3, 0.08, slat, 0, 1.3 + t * 1.2, -0.62 - t * 0.17, 'smooth', { rx: -0.14 });
  }
};

const picnicTable: Builder = (b) => {
  const wood = 0xb98a5a;
  const top = 0xc99a68;
  for (let i = 0; i < 5; i += 1) blk(b, 5, 0.12, 0.42, top, 0, 2.08, -0.88 + i * 0.44);
  for (const s of [-1, 1]) for (const z of [1.68, 2.12]) blk(b, 5, 0.12, 0.42, top, 0, 1.08, s * z);
  for (const x of [-1.9, 1.9]) {
    beam(b, [x, 0, -1.45], [x, 2.08, -0.35], 0.16, 0.22, wood);
    beam(b, [x, 0, 1.45], [x, 2.08, 0.35], 0.16, 0.22, wood);
    blk(b, 0.15, 0.15, 4.7, wood, x, 0.93, 0);
    blk(b, 0.15, 0.12, 2.0, wood, x, 1.96, 0);
  }
};

const busStop: Builder = (b) => {
  const frame = C.charcoal;
  for (const x of [-4.3, 4.3]) {
    blk(b, 0.2, 6.0, 0.2, frame, x, 0, -1.5);
    blk(b, 0.14, 6.0, 0.14, frame, x, 0, 1.4);
  }
  blk(b, 9.4, 0.4, 3.6, C.white, 0, 6.0, 0);
  blk(b, 9.42, 0.3, 0.1, C.teal, 0, 6.05, 1.8);
  blk(b, 9.42, 0.3, 0.1, C.teal, 0, 6.05, -1.8);
  blk(b, 8.0, 0.05, 0.3, C.warm, 0, 5.95, 0.2, 'glow');
  blk(b, 8.4, 4.6, 0.06, 0xbfe8f7, 0, 0.9, -1.55);
  for (const y of [0.8, 5.5]) blk(b, 8.6, 0.12, 0.12, frame, 0, y, -1.55);
  box(b, 0.3, 4.0, 0.01, 0xeaf8ff, -2.5, 3.2, -1.51, 'glow', { rz: -0.5 });
  blk(b, 6.6, 0.12, 0.9, C.lightWood, 0, 1.08, -0.75);
  for (const x of [-3, 0, 3]) blk(b, 0.12, 1.08, 0.7, frame, x, 0, -0.75);
  // The ad panel at the +X end, lit both sides.
  blk(b, 0.25, 4.0, 2.4, frame, 4.3, 1.0, -0.2);
  for (const s of [-1, 1]) {
    const x = 4.3 + s * 0.135;
    box(b, 0.02, 3.6, 2.1, 0xffd9b0, x, 3.0, -0.2, 'glow');
    box(b, 0.02, 0.8, 2.1, 0x3fd6c6, x + s * 0.005, 1.6, -0.2, 'glow');
    box(b, 0.02, 0.8, 0.8, C.coral, x + s * 0.005, 3.6, -0.6, 'glow');
  }
  rod(b, [-4.6, 0, 1.55], [-4.6, 6.0, 1.55], 0.06, C.metal, 4);
  blk(b, 0.06, 1.0, 1.2, C.teal, -4.6, 4.9, 1.0);
  blk(b, 0.07, 0.2, 1.0, C.white, -4.6, 5.45, 1.0);
};

const trashBin: Builder = (b) => {
  cyl(b, 0.66, 0.66, 0.15, C.charcoal, 0, 0, 0, 10);
  cyl(b, 0.6, 0.6, 2.05, C.teal, 0, 0.15, 0, 10);
  cyl(b, 0.62, 0.62, 0.15, C.white, 0, 1.6, 0, 10);
  cyl(b, 0.56, 0.56, 0.1, C.black, 0, 2.2, 0, 10);
  cyl(b, 0.3, 0.68, 0.3, shade(C.teal, 0.8), 0, 2.28, 0, 10);
  disc(b, 0.18, 0.04, C.white, 0, 2.56, 0, 6);
  badge(b, 0.2, 0.03, C.white, 0, 1.0, 0.6, 8);
};

const hydrant: Builder = (b) => {
  const body = 0xffcf3a;
  cyl(b, 0.4, 0.42, 0.12, shade(body, 0.85), 0, 0, 0, 8);
  cyl(b, 0.25, 0.3, 1.1, body, 0, 0.12, 0, 8);
  cyl(b, 0.32, 0.32, 0.1, shade(body, 0.85), 0, 1.2, 0, 8);
  cyl(b, 0.12, 0.28, 0.35, body, 0, 1.3, 0, 8);
  cyl(b, 0.07, 0.07, 0.14, C.chrome, 0, 1.64, 0, 5);
  for (const s of [-1, 1]) {
    rod(b, [s * 0.22, 0.85, 0], [s * 0.42, 0.85, 0], 0.1, body, 6);
    disc(b, 0.11, 0.04, C.chrome, s * 0.43, 0.85, 0, 6);
  }
  rod(b, [0, 0.7, 0.2], [0, 0.7, 0.4], 0.14, body, 6);
  badge(b, 0.15, 0.06, C.chrome, 0, 0.7, 0.42, 6);
};

const planter: Builder = (b) => {
  blk(b, 3.4, 1.0, 3.4, 0xf3e6cf, 0, 0, 0);
  blk(b, 3.42, 0.12, 3.42, C.teal, 0, 0.55, 0);
  blk(b, 3.5, 0.2, 3.5, C.white, 0, 1.0, 0);
  blk(b, 3.0, 0.05, 3.0, C.darkWood, 0, 1.15, 0);
  for (const [x, z, r] of [[-0.95, -0.9, 0.6], [0.95, 0.9, 0.55], [1.0, -0.95, 0.5], [-0.9, 1.0, 0.5]] as const) gem(b, r, C.leaf, x, 1.45, z, 'flat', [1.1, 0.8, 1.1]);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    beam(b, [0, 1.15, 0], [Math.sin(a) * 0.6, 2.4, Math.cos(a) * 0.6], 0.18, 0.04, i % 2 ? 0xb03a5b : 0xd9577a, 'leaf');
  }
  for (const [x, z, c] of [[-0.5, 0.95, C.pink], [0.55, -1.0, C.sunny], [1.2, 0.4, C.coral], [-1.2, -0.3, C.white]] as const) gem(b, 0.16, c, x, 1.7, z, 'smooth');
};

const fountain: Builder = (b) => {
  const stone = 0xece4d4;
  const water = 0x8fe3f5;
  cyl(b, 8, 8, 1.0, stone, 0, 0, 0, 16);
  cyl(b, 8.04, 8.04, 0.2, C.teal, 0, 0.45, 0, 16);
  ring(b, 7.75, 0.35, C.white, { y: 1.05, rx: Math.PI / 2 }, 'smooth', 24, 4);
  disc(b, 7.45, 0.05, water, 0, 0.95, 0, 16, 'smooth');
  for (const r of [3.8, 5.6]) ring(b, r, 0.05, 0xd8f7ff, { y: 1.0, rx: Math.PI / 2 }, 'smooth', 16, 3);
  cyl(b, 0.8, 1.2, 2.6, stone, 0, 1.0, 0, 10);
  cyl(b, 3.0, 1.0, 0.8, stone, 0, 3.4, 0, 12);
  disc(b, 2.85, 0.04, water, 0, 4.17, 0, 12, 'smooth');
  cyl(b, 0.4, 0.6, 1.2, stone, 0, 4.2, 0, 8);
  cyl(b, 1.4, 0.4, 0.5, stone, 0, 5.3, 0, 10);
  disc(b, 1.3, 0.04, water, 0, 5.77, 0, 10, 'smooth');
  cyl(b, 0.08, 0.2, 1.0, 0xd8f7ff, 0, 5.8, 0, 6, 'smooth');
  orb(b, 0.25, 0xd8f7ff, 0, 6.85, 0, 6, 'smooth');
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    box(b, 0.5, 3.1, 0.06, 0xbfeefc, Math.sin(a) * 3.05, 2.6, Math.cos(a) * 3.05, 'smooth', { ry: a });
    if (i % 2 === 0) box(b, 0.3, 1.5, 0.05, 0xbfeefc, Math.sin(a) * 1.42, 5.1, Math.cos(a) * 1.42, 'smooth', { ry: a });
  }
};

const statue: Builder = (b) => {
  const gold = 0xe8b84a;
  blk(b, 4, 0.6, 4, C.stone, 0, 0, 0, 'flat');
  blk(b, 3.2, 3.0, 3.2, 0xf6efe2, 0, 0.6, 0);
  blk(b, 3.6, 0.4, 3.6, C.stone, 0, 3.6, 0, 'flat');
  blk(b, 1.6, 0.8, 0.05, gold, 0, 1.7, 1.62);
  for (const [x, z] of [[-1.7, 1.7], [1.7, 1.7], [-1.7, -1.7], [1.7, -1.7]] as const) blk(b, 0.25, 0.15, 0.25, C.warm, x, 0.6, z, 'glow');
  orb(b, 0.8, C.teal, 0, 4.4, 0, 8, 'smooth', [1, 0.6, 1]);
  const pts: readonly V3[] = [[0, 4.4, 0], [0.12, 6.2, 0], [0.32, 8.0, 0], [0.55, 9.7, 0], [0.7, 11.1, 0]];
  for (let i = 0; i < pts.length - 1; i += 1) rod(b, pts[i]!, pts[i + 1]!, 0.42 - i * 0.06, i % 2 ? shade(gold, 0.9) : gold, 8, 'smooth', 0.36 - i * 0.06, true);
  for (let i = 0; i < 7; i += 1) frond(b, 2.6, 0.45, 0.75, i % 2 ? gold : 0xf2cc68, 0.7, 11.1, 0, (i / 7) * Math.PI * 2 + 0.3, 0.55);
  for (const [x, z] of [[0.4, 0.3], [0.95, 0.2], [0.65, -0.35]] as const) orb(b, 0.28, shade(gold, 0.85), x, 10.8, z, 6);
};

// ================================================================= beach

const lifeguardTower: Builder = (b) => {
  const body = 0xff9ec7;
  const trim = C.teal;
  const post = C.white;
  for (const x of [-2.4, 2.4]) for (const z of [-2.4, 2.4]) blk(b, 0.35, 4.6, 0.35, post, x, 0, z);
  for (const s of [-1, 1]) {
    beam(b, [-2.4, 0.4, s * 2.4], [2.4, 4.3, s * 2.4], 0.14, 0.14, post);
    beam(b, [s * 2.4, 0.4, -2.4], [s * 2.4, 4.3, 2.4], 0.14, 0.14, post);
  }
  blk(b, 6, 0.3, 6, C.lightWood, 0, 4.6, 0);
  blk(b, 6.05, 0.12, 6.05, trim, 0, 4.55, 0);
  blk(b, 4.4, 3.0, 3.4, body, 0, 4.9, -0.6);
  blk(b, 4.42, 0.25, 3.42, trim, 0, 4.9, -0.6);
  blk(b, 4.42, 0.3, 3.42, C.sunny, 0, 5.55, -0.6);
  blk(b, 3.6, 1.1, 0.05, 0x1d5f8a, 0, 6.15, 1.12);
  for (const x of [-1.8, -0.6, 0.6, 1.8]) blk(b, 0.1, 1.2, 0.08, C.white, x, 6.1, 1.13);
  for (const s of [-1, 1]) blk(b, 0.05, 1.0, 2.0, 0x1d5f8a, s * 2.21, 6.2, -0.6);
  blk(b, 1.2, 2.2, 0.05, trim, 0, 4.9, -2.32);
  b.add(new CylinderGeometry(2.1, 2.1, 4.9, 10, 1, false, 0, Math.PI), trim, 'smooth', { y: 7.9, z: -0.6, rz: Math.PI / 2, sx: 0.5 });
  blk(b, 4.9, 0.12, 4.3, C.white, 0, 7.82, -0.6);
  rod(b, [1.6, 8.5, -1.2], [1.6, 9.95, -1.2], 0.04, C.white, 4);
  box(b, 0.04, 0.28, 0.75, C.red, 1.6, 9.78, -0.8, 'leaf');
  box(b, 0.04, 0.28, 0.75, C.sunny, 1.6, 9.5, -0.8, 'leaf');
  // Deck rail, open at the back where the ramp lands.
  for (const [x, z] of [[-2.9, 2.9], [0, 2.9], [2.9, 2.9], [-2.9, 0], [2.9, 0], [-2.9, -2.9], [2.9, -2.9]] as const) rod(b, [x, 4.9, z], [x, 6.0, z], 0.05, C.white, 4);
  for (const y of [5.45, 6.0]) {
    rod(b, [-2.9, y, 2.9], [2.9, y, 2.9], 0.045, C.white, 4);
    for (const s of [-1, 1]) rod(b, [s * 2.9, y, 2.9], [s * 2.9, y, -2.9], 0.045, C.white, 4);
  }
  blk(b, 0.28, 0.9, 0.22, C.red, 1.5, 4.95, 3.05);
  ring(b, 0.45, 0.11, C.orange, { x: 2.24, y: 6.3, z: -1.9, ry: Math.PI / 2 });
  // The ramp, down the back to the sand.
  beam(b, [0, 4.72, -3.0], [0, 0.06, -9.4], 1.6, 0.15, C.lightWood);
  for (const s of [-1, 1]) {
    rod(b, [s * 0.85, 5.75, -3.0], [s * 0.85, 1.0, -9.3], 0.045, C.white, 4);
    rod(b, [s * 0.85, 0, -9.3], [s * 0.85, 1.0, -9.3], 0.05, C.white, 4);
    for (const t of [0.35, 0.68]) {
      const z = -3.0 - 6.4 * t;
      const y = 4.72 * (1 - t);
      rod(b, [s * 0.7, 0, z], [s * 0.7, y - 0.1, z], 0.08, C.white, 4);
    }
  }
};

const beachUmbrella: Builder = (b) => {
  orb(b, 0.45, C.sand, 0, 0, 0, 6, 'smooth', [1, 0.35, 1]);
  rod(b, [0, 0, 0], [0, 6.3, 0], 0.07, C.white, 6);
  canopy(b, 3, 1.3, [C.coral, C.white, C.teal, C.white], 0, 5.0, 0, 12);
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    rod(b, [0, 4.5, 0], [Math.sin(a) * 2.5, 5.2, Math.cos(a) * 2.5], 0.025, C.white, 3);
  }
  orb(b, 0.12, C.white, 0, 6.35, 0, 6);
};

const beachTowel: Builder = (b) => {
  [C.teal, C.white, C.coral, C.white, C.sunny].forEach((c, i) => blk(b, 2.4, 0.06, 1.0, c, 0, 0, -2 + i * 1.0, 'leaf'));
};

const volleyballNet: Builder = (b) => {
  for (const s of [-1, 1]) {
    rod(b, [s * 9.8, 0, 0], [s * 9.8, 6.0, 0], 0.12, C.white, 8);
    orb(b, 0.4, C.sand, s * 9.8, 0, 0, 6, 'smooth', [1, 0.35, 1]);
    rod(b, [s * 9.25, 5.6, 0], [s * 9.25, 6.5, 0], 0.03, C.red, 3);
  }
  blk(b, 19.4, 0.25, 0.06, C.white, 0, 5.45, 0);
  blk(b, 19.4, 0.1, 0.05, C.white, 0, 3.6, 0);
  for (let i = 0; i <= 20; i += 1) blk(b, 0.03, 1.8, 0.03, 0x2a2f36, -9.3 + i * 0.93, 3.7, 0);
  for (let j = 1; j < 5; j += 1) blk(b, 18.6, 0.03, 0.03, 0x2a2f36, 0, 3.7 + j * 0.36, 0);
  orb(b, 0.3, C.sunny, 2.4, 0.3, 0.9, 6);
};

// ============================================================ playground

const swings: Builder = (b) => {
  const frame = C.teal;
  for (const x of [-4.8, 4.8]) for (const z of [-1.8, 1.8]) beam(b, [x, 0, z], [x * 0.96, 6.8, 0], 0.2, 0.2, frame);
  rod(b, [-4.9, 6.8, 0], [4.9, 6.8, 0], 0.14, C.coral, 8);
  for (const [x, c] of [[-2.2, C.coral], [2.2, C.sunny]] as const) {
    for (const dx of [-0.55, 0.55]) {
      rod(b, [x + dx, 6.75, 0], [x + dx, 1.5, 0], 0.03, C.steel, 3);
      blk(b, 0.1, 0.12, 0.25, C.charcoal, x + dx, 6.6, 0);
    }
    blk(b, 1.3, 0.08, 0.55, c, x, 1.42, 0);
  }
};

const slide: Builder = (b) => {
  const frame = C.teal;
  const chute = C.sunny;
  for (const s of [-1, 1]) beam(b, [s * 0.7, 0, -4.8], [s * 0.7, 5.2, -3.2], 0.15, 0.2, frame);
  for (let i = 1; i <= 6; i += 1) {
    const t = i / 7;
    rod(b, [-0.7, t * 5.2, -4.8 + t * 1.6], [0.7, t * 5.2, -4.8 + t * 1.6], 0.06, C.white, 4);
  }
  for (const x of [-1.0, 1.0]) for (const z of [-3.1, -1.3]) rod(b, [x, 0, z], [x, 6.2, z], 0.08, frame, 6);
  blk(b, 2.2, 0.25, 2.0, C.white, 0, 5.0, -2.2);
  for (const s of [-1, 1]) rod(b, [s * 1.0, 5.9, -3.1], [s * 1.0, 5.9, -1.3], 0.05, C.white, 4);
  spike(b, 1.75, 0.85, C.coral, 0, 6.15, -2.2, 4, 'smooth', false, { ry: Math.PI / 4 });
  beam(b, [0, 5.06, -1.2], [0, 0.66, 4.0], 1.2, 0.12, chute);
  for (const s of [-1, 1]) beam(b, [s * 0.65, 5.3, -1.2], [s * 0.65, 0.9, 4.0], 0.12, 0.5, chute);
  blk(b, 1.2, 0.12, 1.0, chute, 0, 0.6, 4.5);
  for (const s of [-1, 1]) blk(b, 0.12, 0.4, 1.0, chute, s * 0.65, 0.6, 4.5);
  for (const s of [-1, 1]) rod(b, [s * 0.5, 0, 1.6], [s * 0.5, 2.6, 1.6], 0.07, frame, 4);
  for (const s of [-1, 1]) rod(b, [s * 0.65, 5.3, -1.3], [s * 0.65, 5.9, -1.2], 0.05, C.white, 4);
};

const seesaw: Builder = (b) => {
  blk(b, 1.4, 0.2, 1.0, C.charcoal, 0, 0, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(b, [sx * 0.6, 0.1, sz * 0.45], [sx * 0.6, 1.1, 0], 0.14, 0.14, C.teal);
  rod(b, [-0.75, 1.1, 0], [0.75, 1.1, 0], 0.09, C.steel, 6);
  blk(b, 0.7, 0.15, 9.6, C.sunny, 0, 1.15, 0);
  for (const [s, c] of [[-1, C.coral], [1, C.teal]] as const) {
    blk(b, 0.9, 0.3, 0.9, c, 0, 1.3, s * 3.8);
    rod(b, [0, 1.3, s * 3.1], [0, 2.1, s * 3.1], 0.05, C.steel, 4);
    rod(b, [-0.4, 2.1, s * 3.1], [0.4, 2.1, s * 3.1], 0.05, c, 4);
    blk(b, 0.6, 0.25, 0.5, C.black, 0, 0, s * 4.6);
  }
};

const hoop: Builder = (b) => {
  blk(b, 1.2, 0.15, 1.2, C.charcoal, 0, 0, -1.5);
  rod(b, [0, 0, -1.5], [0, 10.0, -1.5], 0.15, C.charcoal, 8);
  blk(b, 0.5, 2.0, 0.5, C.teal, 0, 0.15, -1.5);
  beam(b, [0, 9.3, -1.5], [0, 9.6, 0.75], 0.18, 0.18, C.charcoal);
  blk(b, 2.0, 1.5, 0.12, C.white, 0, 9.0, 0.8);
  for (const [w, h, x, y] of [[0.9, 0.06, 0, 9.25], [0.9, 0.06, 0, 9.85], [0.06, 0.6, -0.45, 9.25], [0.06, 0.6, 0.45, 9.25]] as const) blk(b, w, h, 0.02, C.orange, x, y, 0.87);
  for (const [w, h, x, y] of [[2.0, 0.08, 0, 9.0], [2.0, 0.08, 0, 10.42], [0.08, 1.5, -0.96, 9.0], [0.08, 1.5, 0.96, 9.0]] as const) blk(b, w, h, 0.03, C.coral, x, y, 0.88);
  blk(b, 0.3, 0.1, 0.25, C.orange, 0, 9.05, 0.98);
  ring(b, 0.45, 0.04, C.orange, { y: 9.1, z: 1.55, rx: Math.PI / 2 }, 'smooth', 12, 3);
  cyl(b, 0.45, 0.3, 0.6, C.white, 0, 8.5, 1.55, 8, 'leaf', true);
};

const bush: Builder = (b) => {
  gem(b, 1.0, 0x3f9f4f, 0, 0.95, 0, 'flat', [1.3, 1.0, 1.3]);
  gem(b, 0.8, 0x2f8a45, -0.7, 0.66, 0.4, 'flat');
  gem(b, 0.8, 0x4fb35a, 0.7, 0.7, -0.3, 'flat');
  gem(b, 0.7, 0x3f9f4f, 0.2, 1.85, 0.2, 'flat');
  const flowers: readonly (readonly [number, number, number, number])[] = [
    [0.0, 1.5, 1.25, C.red], [-1.2, 1.1, 0.6, C.pink], [1.25, 1.3, 0.3, C.coral], [0.4, 2.3, 0.5, C.red],
    [-0.5, 1.9, -0.8, C.pink], [0.9, 0.9, -0.9, C.red], [-0.7, 0.7, 1.05, C.coral],
  ];
  for (const [x, y, z, c] of flowers) {
    const len = Math.hypot(x, y - 1.0, z) || 1;
    const nx = x / len;
    const ny = (y - 1.0) / len;
    const nz = z / len;
    rod(b, [x - nx * 0.15, y - ny * 0.15, z - nz * 0.15], [x + nx * 0.12, y + ny * 0.12, z + nz * 0.12], 0.03, c, 5, 'smooth', 0.24);
    blk(b, 0.06, 0.06, 0.06, C.lemon, x + nx * 0.16, y + ny * 0.16 - 0.03, z + nz * 0.16);
  }
};

const hedge: Builder = (b) => {
  blk(b, 7.8, 2.3, 1.8, 0x2f8a45, 0, 0, 0, 'flat');
  for (let i = 0; i < 4; i += 1) gem(b, 0.75, i % 2 ? 0x3f9f4f : 0x34914b, -2.9 + i * 1.95, 2.25, 0, 'flat', [1.45, 0.5, 1.15], i * 0.7);
  for (const [x, y, z] of [[-3.2, 1.6, 0.92], [-1.0, 1.0, 0.92], [1.6, 1.8, 0.92], [3.0, 0.9, -0.92], [-0.2, 1.7, -0.92], [2.2, 1.2, 0.92]] as const) blk(b, 0.14, 0.14, 0.06, C.white, x, y, z);
};

const fence: Builder = (b) => {
  const paint = C.white;
  for (const y of [0.5, 1.4]) blk(b, 8, 0.15, 0.08, paint, 0, y, -0.08);
  for (const x of [-3.9, 3.9]) {
    blk(b, 0.2, 1.9, 0.2, paint, x, 0, -0.05);
    blk(b, 0.26, 0.1, 0.26, paint, x, 1.9, -0.05);
  }
  for (let i = 0; i < 12; i += 1) {
    const x = -3.3 + i * 0.6;
    blk(b, 0.3, 1.6, 0.06, paint, x, 0.1, 0.02);
    box(b, 0.21, 0.21, 0.06, paint, x, 1.7, 0.02, 'smooth', { rz: Math.PI / 4 });
  }
};

const mailbox: Builder = (b) => {
  const body = C.teal;
  blk(b, 0.2, 2.1, 0.2, C.white, 0, 0, -0.1);
  blk(b, 0.4, 0.1, 0.6, C.white, 0, 1.95, 0);
  blk(b, 0.6, 0.5, 1.0, body, 0, 2.05, 0);
  b.add(new CylinderGeometry(0.3, 0.3, 1.0, 8, 1, false, Math.PI / 2, Math.PI), body, 'smooth', { y: 2.55, rx: Math.PI / 2 });
  blk(b, 0.62, 0.5, 0.04, shade(body, 1.12), 0, 2.05, 0.5);
  blk(b, 0.12, 0.06, 0.06, C.chrome, 0, 2.5, 0.54);
  blk(b, 0.05, 0.08, 0.35, C.red, 0.33, 2.35, 0.1);
  blk(b, 0.05, 0.25, 0.12, C.red, 0.33, 2.4, 0.3);
  blk(b, 0.3, 0.15, 0.02, C.white, 0, 1.6, 0.01);
};

const parkingMeter: Builder = (b) => {
  disc(b, 0.25, 0.06, C.metal, 0, 0, 0, 6);
  rod(b, [0, 0, 0], [0, 2.2, 0], 0.07, C.metal, 6);
  blk(b, 0.45, 0.55, 0.35, C.charcoal, 0, 2.2, 0);
  cyl(b, 0.15, 0.23, 0.2, C.charcoal, 0, 2.75, 0, 6, 'smooth', false, { sz: 0.75 });
  blk(b, 0.3, 0.16, 0.02, 0x3dff8a, 0, 2.5, 0.18, 'glow');
  blk(b, 0.1, 0.03, 0.02, C.chrome, 0, 2.35, 0.18);
  blk(b, 0.46, 0.08, 0.36, C.sunny, 0, 2.66, 0);
};

const dockPost: Builder = (b) => {
  cyl(b, 0.38, 0.38, 0.3, 0x4a3a2c, 0, 0, 0, 8, 'flat');
  cyl(b, 0.36, 0.38, 1.6, 0x8a6a48, 0, 0.3, 0, 8, 'flat');
  cyl(b, 0.3, 0.36, 0.1, 0x9c7a55, 0, 1.9, 0, 8, 'flat');
  for (const y of [1.15, 1.32]) ring(b, 0.42, 0.07, 0xe8d5a8, { y, rx: Math.PI / 2 }, 'smooth', 10, 3);
};

const buoy: Builder = (b) => {
  cyl(b, 0.5, 0.75, 1.0, C.red, 0, 0, 0, 10);
  cyl(b, 0.56, 0.62, 0.25, C.white, 0, 0.5, 0, 10);
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    rod(b, [Math.sin(a) * 0.42, 1.0, Math.cos(a) * 0.42], [Math.sin(a) * 0.1, 2.2, Math.cos(a) * 0.1], 0.04, C.red, 4);
  }
  box(b, 0.5, 0.5, 0.04, C.white, 0, 1.6, 0, 'smooth', { ry: Math.PI / 4 });
  cyl(b, 0.12, 0.12, 0.22, 0xffe27a, 0, 2.2, 0, 6, 'glow');
  cyl(b, 0.15, 0.15, 0.08, C.charcoal, 0, 2.42, 0, 6);
};

const trafficCone: Builder = (b) => {
  const orange = 0xff7a1a;
  blk(b, 0.9, 0.08, 0.9, shade(orange, 0.8), 0, 0, 0);
  cyl(b, 0.05, 0.36, 1.3, orange, 0, 0.08, 0, 8);
  cyl(b, 0.21, 0.26, 0.2, C.white, 0, 0.55, 0, 8);
  cyl(b, 0.125, 0.16, 0.15, C.white, 0, 0.95, 0, 8);
};

// ============================================================== registry

const BUILDERS: Readonly<Record<string, Builder>> = {
  // living room
  sofa,
  sofa_corner: sofaCorner,
  armchair,
  bean_bag: beanBag,
  coffee_table: coffeeTable,
  tv,
  bookshelf,
  floor_lamp: floorLamp,
  plant: pottedPalm,
  rug,
  wall_art: wallArt,
  aquarium,
  piano,
  arcade,
  pool_table: poolTable,
  // bedroom
  bed,
  bed_single: bedSingle,
  dresser,
  desk,
  office_chair: officeChair,
  wardrobe,
  // kitchen
  fridge,
  kitchen_counter: kitchenCounter,
  stove,
  dining_table: diningTable,
  chair,
  bar_stool: barStool,
  // bath
  toilet,
  bathtub,
  sink,
  // outdoor
  hot_tub: hotTub,
  sun_lounger: sunLounger,
  bbq,
  patio_set: patioSet,
  flamingo,
  // commercial
  counter,
  shelf,
  cooler,
  clothes_rack: clothesRack,
  mannequin,
  mirror,
  booth,
  cafe_table: cafeTable,
  coffee_machine: coffeeMachine,
  fryer,
  grill,
  soda_fountain: sodaFountain,
  display_case: displayCase,
  hospital_bed: hospitalBed,
  monitor: heartMonitor,
  reception,
  job_desk: jobDesk,
  police_desk: policeDesk,
  bars,
  locker,
  jail_desk: jailDesk,
  atm,
  vending,
  gas_pump: gasPump,
  display_pad: displayPad,
  dealer_desk: dealerDesk,
  depot_desk: depotDesk,
  crate_stack: crateStack,
  pallet,
  hangar_desk: hangarDesk,
  boat_kiosk: boatKiosk,
  fire_pole: firePole,
  treadmill,
  // street, parks, beach, playground
  bench,
  picnic_table: picnicTable,
  bus_stop: busStop,
  trash_bin: trashBin,
  hydrant,
  planter,
  fountain,
  statue,
  lifeguard_tower: lifeguardTower,
  beach_umbrella: beachUmbrella,
  beach_towel: beachTowel,
  volleyball_net: volleyballNet,
  swings,
  slide,
  seesaw,
  hoop,
  bush,
  hedge,
  fence,
  mailbox,
  parking_meter: parkingMeter,
  dock_post: dockPost,
  buoy,
  cone: trafficCone,
};

/** Build prop `key` into `b`, at the origin, base on y=0, facing +Z, filling its PropDef footprint. Unknown keys build nothing. */
export const buildProp = (b: PartBuilder, key: string): void => {
  BUILDERS[key]?.(b);
};

/** Every key buildProp handles (equals the shared PROPS keys). */
export const PROP_KEYS: readonly string[] = Object.freeze(Object.keys(BUILDERS));

// ================================================================ scenery

/** A palm tree: trunk base at origin, `height` tall, leaning toward +X by `lean` radians, 8 drooping fronds and coconuts. About 320 triangles. */
export const buildPalm = (b: PartBuilder, height: number, lean: number): void => {
  const h = Math.max(4, height);
  const reach = h * Math.sin(lean);
  const at = (t: number): V3 => [reach * Math.pow(t, 1.5), h * t, 0];
  const segs = 6;
  const bark = [0xa98a62, 0x947650];
  cyl(b, 0.5, 0.78, 0.6, 0x8a6c48, 0, 0, 0, 6, 'flat');
  for (let i = 0; i < segs; i += 1) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const r0 = 0.52 - t0 * 0.22;
    const r1 = 0.52 - t1 * 0.22;
    rod(b, at(t0), at(t1), r0 * 1.12, bark[i % 2] ?? 0xa98a62, 6, 'flat', r1, true);
  }
  const top = at(1);
  orb(b, 0.45, 0x6f8f3a, top[0], top[1] - 0.1, top[2], 6, 'flat', [1, 0.8, 1]);
  for (let i = 0; i < 3; i += 1) {
    const a = i * 2.1 + 0.4;
    gem(b, 0.27, 0x7a5a2a, top[0] + Math.cos(a) * 0.42, top[1] - 0.45, top[2] + Math.sin(a) * 0.42, 'flat');
  }
  const len = 3.0 + h * 0.13;
  const greens = [C.palm, C.leaf, 0x4aa84f, 0x6cc25a];
  for (let i = 0; i < 8; i += 1) {
    const yaw = (i / 8) * Math.PI * 2 + 0.3 + (i % 3) * 0.12;
    const pitch = i % 2 ? 0.55 : 0.25;
    frond(b, len * (i % 2 ? 0.85 : 1), 0.58, 0.95, greens[i % greens.length] ?? C.palm, top[0], top[1], top[2], yaw, pitch);
  }
};

/** A broadleaf tropical tree ('round', ~9 tall), a Norfolk-pine-ish 'cone' (~11) or a flowering 'shrub' (~4). Base at origin. */
export const buildTree = (b: PartBuilder, kind: 'round' | 'cone' | 'shrub'): void => {
  if (kind === 'cone') {
    cyl(b, 0.3, 0.45, 0.5, C.bark, 0, 0, 0, 6, 'flat');
    rod(b, [0, 0.4, 0], [0, 3.2, 0], 0.32, C.bark, 6, 'flat', 0.2, true);
    const tiers: readonly (readonly [number, number, number, number])[] = [
      [2.6, 3.2, 2.0, 0x2f7d45], [2.1, 2.8, 4.0, 0x358a4b], [1.6, 2.4, 6.0, 0x2f7d45], [1.0, 2.4, 8.4, 0x3d9653],
    ];
    for (const [r, hh, y, c] of tiers) spike(b, r, hh, c, 0, y, 0, 8, 'flat');
    return;
  }
  if (kind === 'shrub') {
    gem(b, 1.5, 0x3f9f4f, 0, 1.2, 0, 'flat', [1.2, 0.95, 1.2]);
    gem(b, 1.0, 0x2f8a45, -0.95, 0.82, 0.5, 'flat');
    gem(b, 1.0, 0x4fb35a, 0.95, 0.85, -0.4, 'flat', [1, 1, 1], 0.6);
    gem(b, 1.0, 0x3f9f4f, 0.2, 2.6, 0.1, 'flat', [1, 1, 1], 1.1);
    for (const [x, y, z, c] of [[0.3, 2.2, 1.35, C.pink], [-1.3, 1.6, 0.7, C.coral], [1.45, 1.8, 0.2, C.pink], [-0.2, 3.3, -0.6, C.white]] as const) gem(b, 0.2, c, x, y, z, 'smooth');
    return;
  }
  cyl(b, 0.45, 0.65, 0.6, C.bark, 0, 0, 0, 6, 'flat');
  rod(b, [0, 0.5, 0], [0.2, 5.0, 0], 0.45, C.bark, 6, 'flat', 0.3, true);
  rod(b, [0.1, 4.0, 0], [-1.4, 5.9, 0.4], 0.22, C.bark, 6, 'flat', 0.12, true);
  rod(b, [0.15, 4.3, 0], [1.5, 6.0, -0.5], 0.22, C.bark, 6, 'flat', 0.12, true);
  const blobs: readonly (readonly [number, number, number, number, number])[] = [
    [0.1, 6.8, 0, 2.4, 0x3f9f4f], [-1.7, 6.2, 0.6, 1.7, 0x358a4b], [1.8, 6.3, -0.6, 1.7, 0x4aa84f], [0.3, 7.6, 1.3, 1.6, 0x4fb35a], [-0.5, 7.9, -1.1, 1.5, 0x358a4b],
  ];
  blobs.forEach(([x, y, z, r, c], i) => gem(b, r, c, x, y, z, 'flat', i === 0 ? [1.25, 0.85, 1.25] : [1, 0.85, 1], i * 0.7));
  for (const [x, y, z] of [[1.2, 8.3, 0.9], [-1.9, 7.2, 1.2], [2.6, 6.9, 0.4], [-0.6, 8.9, -0.4], [0.8, 6.4, 2.6], [-2.6, 6.0, -0.6]] as const) gem(b, 0.25, C.coral, x, y, z, 'smooth');
};

/** A Miami street lamp ~11 tall: pole at origin, a curved arm reaching ~3 toward +Z, a warm 'glow' lens under the head. ~140 triangles. */
export const buildStreetLamp = (b: PartBuilder): void => {
  const paint = 0x2e5e66;
  cyl(b, 0.3, 0.45, 1.0, paint, 0, 0, 0, 6);
  rod(b, [0, 1.0, 0], [0, 10.3, 0], 0.16, paint, 6, 'smooth', 0.11, true);
  cyl(b, 0.2, 0.2, 0.25, 0xe8b84a, 0, 4.8, 0, 6);
  const arm: readonly V3[] = [[0, 10.2, 0], [0, 10.95, 0.8], [0, 11.05, 2.0], [0, 10.75, 3.0]];
  for (let i = 0; i < arm.length - 1; i += 1) rod(b, arm[i]!, arm[i + 1]!, 0.1, paint, 6, 'smooth', 0.09, true);
  cyl(b, 0.22, 0.55, 0.4, paint, 0, 10.35, 3.0, 6);
  cyl(b, 0.45, 0.38, 0.14, C.warm, 0, 10.21, 3.0, 6, 'glow');
};

type LampColor = 'red' | 'yellow' | 'green';
interface SignalLamp {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly color: LampColor;
}

/**
 * A traffic-signal mast: pole at origin (~9.5 tall), an arm along +Z (~19
 * long, at y 8.6) and two double-sided housings at z 11 and 17. The lenses
 * are NOT built: their centres come back (red top, yellow, green bottom, on
 * both the +X and -X faces of each housing). ~240 triangles.
 */
export const buildSignalMast = (b: PartBuilder): { readonly lamps: readonly SignalLamp[] } => {
  const grey = 0x8a939c;
  const housing = 0x2a2f36;
  blk(b, 0.9, 0.4, 0.9, grey, 0, 0, 0);
  rod(b, [0, 0, 0], [0, 9.5, 0], 0.22, grey, 8, 'smooth', 0.18);
  rod(b, [0, 8.6, 0], [0, 8.6, 19], 0.14, grey, 6, 'smooth', 0.1);
  beam(b, [0, 7.0, 0], [0, 8.55, 3.6], 0.1, 0.12, grey);
  blk(b, 0.06, 0.5, 3.0, 0x1f7a5c, 0, 7.9, 5.5);
  const lamps: SignalLamp[] = [];
  const colors: readonly LampColor[] = ['red', 'yellow', 'green'];
  for (const z of [11, 17]) {
    blk(b, 0.15, 0.2, 0.15, grey, 0, 8.4, z);
    blk(b, 0.9, 3.0, 1.0, housing, 0, 5.45, z);
    box(b, 0.12, 3.5, 1.5, 0x1f232b, 0, 6.95, z);
    colors.forEach((color, i) => {
      const y = 7.9 - i * 0.95;
      box(b, 1.3, 0.06, 0.7, housing, 0, y + 0.42, z);
      for (const x of [0.47, -0.47]) lamps.push({ x, y, z, color });
    });
  }
  return { lamps };
};

// ============================================================== landmarks

/** Stroke glyphs on a 4 x 6 grid: [x0, y0, x1, y1] per stroke. */
const GLYPHS: Readonly<Record<string, readonly (readonly [number, number, number, number])[]>> = {
  A: [[0, 0, 2, 6], [4, 0, 2, 6], [0.9, 2, 3.1, 2]],
  B: [[0, 0, 0, 6], [0, 6, 3, 6], [3, 6, 3.8, 5.2], [3.8, 5.2, 3.8, 3.8], [3.8, 3.8, 3, 3], [0, 3, 3, 3], [3, 3, 4, 2.2], [4, 2.2, 4, 0.8], [4, 0.8, 3, 0], [0, 0, 3, 0]],
  C: [[4, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 1], [0, 1, 1, 0], [1, 0, 4, 0]],
  D: [[0, 0, 0, 6], [0, 6, 2.5, 6], [2.5, 6, 4, 4.5], [4, 4.5, 4, 1.5], [4, 1.5, 2.5, 0], [2.5, 0, 0, 0]],
  E: [[0, 0, 0, 6], [0, 6, 4, 6], [0, 3, 3, 3], [0, 0, 4, 0]],
  F: [[0, 0, 0, 6], [0, 6, 4, 6], [0, 3, 3, 3]],
  G: [[4, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 1], [0, 1, 1, 0], [1, 0, 4, 0], [4, 0, 4, 3], [4, 3, 2.2, 3]],
  H: [[0, 0, 0, 6], [4, 0, 4, 6], [0, 3, 4, 3]],
  I: [[2, 0, 2, 6], [0.5, 6, 3.5, 6], [0.5, 0, 3.5, 0]],
  J: [[4, 6, 4, 1], [4, 1, 3, 0], [3, 0, 1, 0], [1, 0, 0, 1], [1.5, 6, 4, 6]],
  K: [[0, 0, 0, 6], [0, 2.5, 4, 6], [1.4, 3.5, 4, 0]],
  L: [[0, 0, 0, 6], [0, 0, 4, 0]],
  M: [[0, 0, 0, 6], [4, 0, 4, 6], [0, 6, 2, 3], [4, 6, 2, 3]],
  N: [[0, 0, 0, 6], [4, 0, 4, 6], [0, 6, 4, 0]],
  O: [[1, 0, 3, 0], [3, 0, 4, 1], [4, 1, 4, 5], [4, 5, 3, 6], [3, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 1], [0, 1, 1, 0]],
  P: [[0, 0, 0, 6], [0, 6, 3, 6], [3, 6, 4, 5], [4, 5, 4, 4], [4, 4, 3, 3], [3, 3, 0, 3]],
  Q: [[1, 0, 3, 0], [3, 0, 4, 1], [4, 1, 4, 5], [4, 5, 3, 6], [3, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 1], [0, 1, 1, 0], [2.6, 1.4, 4.2, -0.2]],
  R: [[0, 0, 0, 6], [0, 6, 3, 6], [3, 6, 4, 5], [4, 5, 4, 4], [4, 4, 3, 3], [3, 3, 0, 3], [1.8, 3, 4, 0]],
  S: [[4, 6, 1, 6], [1, 6, 0, 5], [0, 5, 0, 4], [0, 4, 1, 3], [1, 3, 3, 3], [3, 3, 4, 2], [4, 2, 4, 1], [4, 1, 3, 0], [3, 0, 0, 0]],
  T: [[0, 6, 4, 6], [2, 6, 2, 0]],
  U: [[0, 6, 0, 1], [0, 1, 1, 0], [1, 0, 3, 0], [3, 0, 4, 1], [4, 1, 4, 6]],
  V: [[0, 6, 2, 0], [4, 6, 2, 0]],
  W: [[0, 6, 0.8, 0], [0.8, 0, 2, 3], [2, 3, 3.2, 0], [3.2, 0, 4, 6]],
  X: [[0, 0, 4, 6], [0, 6, 4, 0]],
  Y: [[0, 6, 2, 3], [4, 6, 2, 3], [2, 3, 2, 0]],
  Z: [[0, 6, 4, 6], [4, 6, 0, 0], [0, 0, 4, 0]],
};

/** Giant block letters (~6 tall, pitch 9.2: 'PALMHAVEN' ~80 long) along X, centred, on a low plinth. */
const palmSign = (b: B, text: string): void => {
  const chars = [...text.toUpperCase()];
  const n = Math.max(1, chars.length);
  const T = 1.3;
  const ux = 1.25;
  const uy = (6 - T) / 6;
  const letterW = 4 * ux + T;
  const pitch = 9.2;
  const total = (n - 1) * pitch + letterW;
  const plinthH = 0.9;
  blk(b, total + 4, plinthH, 5, C.stone, 0, 0, 0, 'flat');
  blk(b, total + 4.04, 0.2, 5.04, C.teal, 0, 0.35, 0);
  const colors = [C.coral, C.teal, C.sunny, C.pink, C.aqua, C.lilac, C.orange, C.mint, C.sky];
  chars.forEach((ch, i) => {
    const strokes = GLYPHS[ch];
    if (!strokes) return;
    const x0 = -total / 2 + i * pitch + T / 2;
    const c = colors[i % colors.length] ?? C.coral;
    for (const [gx0, gy0, gx1, gy1] of strokes) {
      const ax = x0 + gx0 * ux;
      const ay = plinthH + T / 2 + gy0 * uy;
      const ex = x0 + gx1 * ux;
      const ey = plinthH + T / 2 + gy1 * uy;
      const len = Math.hypot(ex - ax, ey - ay);
      box(b, len + T, T, 1.6, c, (ax + ex) / 2, (ay + ey) / 2, 0, 'smooth', { rz: Math.atan2(ey - ay, ex - ax) });
    }
    blk(b, 0.8, 0.12, 0.3, C.warm, x0 + 2 * ux, plinthH, 2.1, 'glow');
  });
};

const gasCanopy = (b: B): void => {
  for (const x of [-22, 22]) for (const z of [-10, 10]) {
    blk(b, 1.6, 7.6, 1.6, C.white, x, 0, z);
    blk(b, 1.9, 1.4, 1.9, C.teal, x, 0, z);
    blk(b, 1.95, 0.15, 1.95, C.sunny, x, 1.4, z);
  }
  blk(b, 50, 1.4, 24, C.white, 0, 7.6, 0, 'stud');
  for (const s of [-1, 1]) {
    blk(b, 50.1, 0.35, 0.06, C.teal, 0, 7.75, s * 12.02);
    blk(b, 50.1, 0.22, 0.06, 0x7ff5ea, 0, 8.55, s * 12.03, 'glow');
    blk(b, 0.06, 0.35, 24.1, C.teal, s * 25.02, 7.75, 0);
    blk(b, 0.06, 0.22, 24.1, 0x7ff5ea, s * 25.03, 8.55, 0, 'glow');
  }
  for (const x of [-15, -5, 5, 15]) for (const z of [-5, 5]) blk(b, 3, 0.05, 1.5, C.warm, x, 7.55, z, 'glow');
};

const flagpoles = (b: B): void => {
  blk(b, 22, 0.6, 3, C.stone, 0, 0, 0, 'flat');
  const leaf = (w: number, h: number, c: number, x: number, y: number, t = 0.05): void => box(b, w, h, t, c, x, y, 0, 'leaf');
  [-8, 0, 8].forEach((px, k) => {
    cyl(b, 0.35, 0.4, 0.5, C.white, px, 0.6, 0, 8);
    rod(b, [px, 1.1, 0], [px, 14, 0], 0.12, C.white, 8, 'smooth', 0.08);
    orb(b, 0.2, 0xe8b84a, px, 14.1, 0, 6);
    const fx = px + 0.1 + 2.5;
    const top = 13.6;
    if (k === 1) {
      // Palmhaven: teal and white bars, a coral canton with a sun.
      for (let i = 0; i < 5; i += 1) leaf(5, 0.6, i % 2 ? C.white : C.teal, fx, top - 0.3 - i * 0.6);
      leaf(2, 1.8, C.coral, px + 1.1, top - 0.9, 0.07);
      badge(b, 0.5, 0.09, C.sunny, px + 1.1, top - 0.9, 0, 10);
    } else if (k === 0) {
      // Sunset: coral, peach and gold bands with a teal hoist wedge.
      [C.coral, C.peach, C.sunny].forEach((c, i) => leaf(5, 1.0, c, fx, top - 0.5 - i));
      box(b, 1.6, 1.6, 0.07, C.teal, px + 0.4, top - 1.5, 0, 'leaf', { rz: Math.PI / 4, sx: 0.8 });
    } else {
      // Flamingo: pink and white stripes, a mint canton with a white palm.
      for (let i = 0; i < 7; i += 1) leaf(5, 3 / 7, i % 2 ? C.white : C.pink, fx, top - 1.5 / 7 - (i * 3) / 7);
      leaf(2, 1.7, C.mint, px + 1.1, top - 0.85, 0.07);
      box(b, 0.12, 0.9, 0.09, C.white, px + 1.1, top - 1.1, 0, 'leaf');
      for (const a of [-0.7, 0, 0.7]) box(b, 0.7, 0.12, 0.09, C.white, px + 1.1 + Math.sin(a) * 0.3, top - 0.6, 0, 'leaf', { rz: a });
    }
  });
};

const lighthouseLamp = (b: B): void => {
  const dark = 0x2b2b2b;
  const red = 0xe53e3e;
  cyl(b, 6.4, 6.4, 0.4, dark, 0, 0, 0, 12);
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    rod(b, [Math.sin(a) * 6.2, 0.4, Math.cos(a) * 6.2], [Math.sin(a) * 6.2, 1.5, Math.cos(a) * 6.2], 0.05, dark, 4, 'smooth', 0.05, true);
  }
  ring(b, 6.2, 0.07, dark, { y: 1.5, rx: Math.PI / 2 }, 'smooth', 24, 3);
  cyl(b, 3.6, 3.6, 0.9, C.white, 0, 0.4, 0, 10);
  cyl(b, 3.2, 3.2, 2.4, 0xfff1a8, 0, 1.3, 0, 10, 'glow');
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    blk(b, 0.14, 2.4, 0.14, dark, Math.sin(a) * 3.25, 1.3, Math.cos(a) * 3.25, 'smooth', { ry: a });
  }
  cyl(b, 3.8, 3.8, 0.3, red, 0, 3.7, 0, 10);
  spike(b, 3.6, 1.6, red, 0, 4.0, 0, 10);
  orb(b, 0.35, dark, 0, 5.75, 0, 6);
  rod(b, [0, 5.9, 0], [0, 6.4, 0], 0.04, dark, 4);
};

const welcomeSign = (b: B): void => {
  blk(b, 2.4, 0.9, 25, 0xf3e6cf, 0, 0, 0);
  blk(b, 2.42, 0.15, 25.02, C.teal, 0, 0.45, 0);
  for (let i = 0; i < 9; i += 1) gem(b, 0.45, i % 3 === 0 ? C.pink : i % 3 === 1 ? C.leaf : C.coral, 0.6 * (i % 2 ? 1 : -1), 1.05, -11 + i * 2.75, i % 3 === 1 ? 'flat' : 'smooth', [1, 0.7, 1]);
  for (const z of [-10.5, 10.5]) {
    blk(b, 1.4, 6.6, 1.4, C.coral, 0, 0, z);
    blk(b, 1.7, 0.4, 1.7, C.cream, 0, 6.6, z);
  }
  blk(b, 0.6, 4.0, 20, C.teal, 0, 1.6, 0);
  for (const s of [-1, 1]) blk(b, 0.1, 3.4, 19, C.cream, s * 0.33, 1.9, 0);
  blk(b, 0.05, 0.1, 19.6, 0xff7fbf, 0.31, 5.45, 0, 'glow');
  b.add(new CylinderGeometry(1.4, 1.4, 0.5, 10, 1, false, 0, Math.PI), C.sunny, 'smooth', { y: 5.6, rz: Math.PI / 2 });
  b.add(new CylinderGeometry(0.8, 0.8, 0.56, 8, 1, false, 0, Math.PI), C.orange, 'smooth', { y: 5.6, rz: Math.PI / 2 });
  for (const z of [-4, 4]) blk(b, 0.3, 0.2, 0.3, C.warm, 1.0, 0.9, z, 'glow');
  for (const s of [-1, 1]) sub(b, { x: -0.6, z: s * 12.6, ry: -s * Math.PI / 2, sx: 0.72, sy: 0.72, sz: 0.72 }, (p) => buildPalm(p, 10, 0.12));
};

const stage = (b: B): void => {
  blk(b, 16, 1.2, 10, 0x6b4a32, 0, 0, 0);
  blk(b, 16.05, 0.25, 0.05, C.teal, 0, 0.9, 5.02);
  blk(b, 16, 7, 0.4, C.coral, 0, 1.2, -4.8);
  for (let i = 0; i < 5; i += 1) blk(b, 0.2, 6.6, 0.05, i % 2 ? C.sunny : C.aqua, -6 + i * 3, 1.4, -4.58, 'glow');
  for (const x of [-7.6, 7.6]) {
    rod(b, [x, 1.2, 4.6], [x, 9.0, 4.6], 0.15, C.steel, 6);
    blk(b, 1.4, 2.2, 1.2, C.black, x * 0.9, 1.2, 3.8);
    badge(b, 0.4, 0.05, C.charcoal, x * 0.9, 2.6, 4.42, 8);
  }
  rod(b, [-7.6, 9.0, 4.6], [7.6, 9.0, 4.6], 0.15, C.steel, 6);
  for (let i = 0; i < 6; i += 1) blk(b, 0.5, 0.5, 0.5, [C.pink, C.warm, C.aqua][i % 3] ?? C.warm, -6.25 + i * 2.5, 8.35, 4.6, 'glow');
  for (let i = 0; i < 3; i += 1) blk(b, 2.4, 0.4, 0.8, C.steel, 9.2, i * 0.4, 3.4 - i * 0.8);
};

const waterTower = (b: B): void => {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(b, [sx * 3.2, 0, sz * 3.2], [sx * 2.2, 14, sz * 2.2], 0.4, 0.4, C.steel);
  for (const y of [5, 10]) for (const s of [-1, 1]) {
    const r = 3.2 - (y / 14);
    blk(b, r * 2, 0.2, 0.2, C.steel, 0, y, s * r);
    blk(b, 0.2, 0.2, r * 2, C.steel, s * r, y, 0);
  }
  cyl(b, 4, 4, 5, C.aqua, 0, 14, 0, 12);
  cyl(b, 4.05, 4.05, 0.8, C.coral, 0, 16, 0, 12);
  ring(b, 4.4, 0.1, C.steel, { y: 14.1, rx: Math.PI / 2 }, 'smooth', 16, 3);
  spike(b, 4.3, 2.2, C.white, 0, 19, 0, 12);
  orb(b, 0.3, C.coral, 0, 21.3, 0, 6);
};

/** Static landmarks; see `Landmark['kind']` in the shared world types. Unknown kinds build nothing. */
export const buildLandmark = (b: PartBuilder, kind: string, text?: string): void => {
  switch (kind) {
    case 'gas_canopy':
      gasCanopy(b);
      return;
    case 'flagpoles':
      flagpoles(b);
      return;
    case 'lighthouse_lamp':
      lighthouseLamp(b);
      return;
    case 'welcome_sign':
      welcomeSign(b);
      return;
    case 'palm_sign':
      palmSign(b, text ?? 'PALMHAVEN');
      return;
    case 'stage':
      stage(b);
      return;
    case 'water_tower':
      waterTower(b);
      return;
    case 'ferris': {
      const f = buildFerrisWheel();
      b.absorb(f.base);
      b.absorb(f.wheel, { x: f.hub.x, y: f.hub.y, z: f.hub.z });
      return;
    }
    default:
  }
};

// ========================================================== Ferris wheel

const WHEEL_R = 16.5;
const RIM_X = 1.4;
const HUB = { x: 0, y: 20.8, z: 0 } as const;

/**
 * The pier's Ferris wheel. `base` (A-frame legs, platform, ticket booth) is
 * built at the origin; `wheel` (rims, spokes, lights, 12 gondolas) is built
 * centred on ITS OWN origin in the YZ plane - place it at `hub` and spin it
 * with rotation.x.
 */
export const buildFerrisWheel = (): { readonly base: PartBuilder; readonly wheel: PartBuilder; readonly hub: { readonly x: number; readonly y: number; readonly z: number } } => {
  const base = new PartBuilder();
  const wheel = new PartBuilder();
  const leg = C.white;

  // ---- base
  blk(base, 12, 0.8, 10, 0xf3e6cf, 0, 0, 0);
  blk(base, 12.04, 0.2, 10.04, C.teal, 0, 0.3, 0);
  for (const sx of [-1, 1]) {
    const top: V3 = [sx * 2.3, HUB.y, 0];
    for (const sz of [-1, 1]) {
      const foot: V3 = [sx * 3.8, 0.8, sz * 4.4];
      beam(base, foot, top, 0.5, 0.5, leg);
      for (let i = 1; i <= 5; i += 1) {
        const t = i / 6;
        blk(base, 0.22, 0.22, 0.22, i % 2 ? C.pink : C.aqua, foot[0] + (top[0] - foot[0]) * t + sx * 0.3, foot[1] + (top[1] - foot[1]) * t, foot[2] + (top[2] - foot[2]) * t, 'glow');
      }
    }
    for (const t of [0.3, 0.62]) {
      const y = 0.8 + (HUB.y - 0.8) * t;
      const x = sx * (3.8 - 1.5 * t);
      const z = 4.4 * (1 - t);
      blk(base, 0.3, 0.3, z * 2, C.teal, x, y - 0.15, 0);
    }
    cyl(base, 0.7, 0.7, 0.5, C.coral, sx * 2.55, HUB.y, 0, 10, 'smooth', false, { rz: Math.PI / 2, y: HUB.y });
  }
  rod(base, [-2.6, HUB.y, 0], [2.6, HUB.y, 0], 0.45, C.chrome, 8);
  blk(base, 2.0, 2.4, 1.6, C.coral, 4.4, 0.8, 3.6);
  blk(base, 2.3, 0.2, 1.9, C.white, 4.4, 3.2, 3.6);
  blk(base, 1.4, 0.8, 0.04, 0x9fe3f5, 4.4, 1.9, 4.41);
  blk(base, 3, 0.4, 1, 0xf3e6cf, 0, 0, 5.5);
  for (const sx of [-1, 1]) rod(base, [sx * 5.9, 0.8, -4.9], [sx * 5.9, 0.8, 4.9], 0.06, C.white, 4);
  for (const sx of [-1, 1]) for (const z of [-4.9, 0, 4.9]) rod(base, [sx * 5.9, 0.8, z], [sx * 5.9, 2.0, z], 0.05, C.white, 4);
  for (const sx of [-1, 1]) rod(base, [sx * 5.9, 2.0, -4.9], [sx * 5.9, 2.0, 4.9], 0.05, C.white, 4);

  // ---- wheel (centred at its own origin)
  for (const x of [-RIM_X, RIM_X]) {
    ring(wheel, WHEEL_R, 0.22, leg, { x, ry: Math.PI / 2 }, 'smooth', 36, 4);
    ring(wheel, 8, 0.15, C.teal, { x, ry: Math.PI / 2 }, 'smooth', 24, 3);
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
      beam(wheel, [x, 0, 0], [x, Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R], 0.15, 0.15, leg);
    }
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * Math.PI * 2;
      blk(wheel, 0.3, 0.3, 0.3, i % 2 ? C.warm : [C.pink, C.aqua, C.sunny][i % 3] ?? C.pink, x + Math.sign(x) * 0.22, Math.cos(a) * WHEEL_R - 0.15, Math.sin(a) * WHEEL_R, 'glow');
    }
  }
  cyl(wheel, 1.2, 1.2, 3.2, leg, 0, 0, 0, 12, 'smooth', false, { rz: Math.PI / 2, y: 0 });
  for (const x of [-1.62, 1.62]) cyl(wheel, 0.8, 0.8, 0.1, C.coral, x, 0, 0, 10, 'smooth', false, { rz: Math.PI / 2, y: 0 });
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const y = Math.cos(a) * WHEEL_R;
    const z = Math.sin(a) * WHEEL_R;
    rod(wheel, [-RIM_X, y, z], [RIM_X, y, z], 0.1, leg, 4);
    const c = hue(i / 12, 0.75, 0.68);
    rod(wheel, [0, y, z], [0, y - 0.5, z], 0.06, C.metal, 4);
    spike(wheel, 1.15, 0.5, shade(c, 1.1), 0, y - 1.0, z, 8);
    blk(wheel, 1.8, 1.6, 1.7, c, 0, y - 2.6, z);
    blk(wheel, 1.84, 0.5, 1.74, 0xbfe8f7, 0, y - 1.6, z);
    blk(wheel, 1.95, 0.15, 1.85, shade(c, 0.7), 0, y - 2.75, z);
  }

  return { base, wheel, hub: HUB };
};
