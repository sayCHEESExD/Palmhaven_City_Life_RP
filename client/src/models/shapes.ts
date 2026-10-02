import { BoxGeometry, ConeGeometry, CylinderGeometry, SphereGeometry, type BufferGeometry } from 'three';
import type { PartBuilder, PartKind, Transform } from '../render/PartBuilder.js';

/**
 * ROBLOX PARTS: the four primitives every model here is made of - Block,
 * Ball, Cylinder and Wedge (plus a cone for spikes) - added to a
 * `PartBuilder` with a colour, a material kind and a transform. Kept
 * deliberately low-poly: a street of forty palms is one merged mesh.
 */
export const block = (b: PartBuilder, w: number, h: number, d: number, color: number, t: Transform = {}, kind: PartKind = 'smooth'): void => {
  b.add(new BoxGeometry(w, h, d), color, kind, t);
};

/** A studded block (the world's plastic, studs drawn by the shader). */
export const brick = (b: PartBuilder, w: number, h: number, d: number, color: number, t: Transform = {}): void => {
  b.box(w, h, d, color, 'stud', t);
};

export const ball = (b: PartBuilder, r: number, color: number, t: Transform = {}, kind: PartKind = 'smooth', detail = 1): void => {
  const segments = detail > 1 ? 14 : detail < 1 ? 6 : 10;
  b.add(new SphereGeometry(r, segments, Math.max(4, Math.round(segments * 0.7))), color, kind, t);
};

export const cylinder = (b: PartBuilder, rTop: number, rBottom: number, h: number, color: number, t: Transform = {}, kind: PartKind = 'smooth', segments = 10): void => {
  b.add(new CylinderGeometry(rTop, rBottom, h, segments), color, kind, t);
};

export const cone = (b: PartBuilder, r: number, h: number, color: number, t: Transform = {}, kind: PartKind = 'smooth', segments = 8): void => {
  b.add(new ConeGeometry(r, h, segments), color, kind, t);
};

/** A half ball (a mushroom cap, a dome). */
export const dome = (b: PartBuilder, r: number, color: number, t: Transform = {}, kind: PartKind = 'smooth'): void => {
  b.add(new SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), color, kind, t);
};

/** A wedge: a box sliced corner to corner, the slope rising toward +Z. */
export const wedge = (b: PartBuilder, w: number, h: number, d: number, color: number, t: Transform = {}, kind: PartKind = 'smooth'): void => {
  const g: BufferGeometry = new BoxGeometry(w, h, d).toNonIndexed();
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i += 1) {
    // The top face's front edge drops to the bottom: a ramp.
    if (pos.getY(i) > 0 && pos.getZ(i) < 0) pos.setY(i, -h / 2);
  }
  g.computeVertexNormals();
  b.add(g, color, kind, t);
};

// ------------------------------------------------------------------ colour

/** Shade a hex colour by a factor. */
export const shade = (hex: number, k: number): number => {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * k));
  const bl = Math.min(255, Math.round((hex & 255) * k));
  return (r << 16) | (g << 8) | bl;
};

/** Blend two hex colours. */
export const mix = (a: number, b: number, t: number): number => {
  const k = Math.max(0, Math.min(1, t));
  const r = Math.round(((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k);
  const g = Math.round(((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k);
  const bl = Math.round((a & 255) * (1 - k) + (b & 255) * k);
  return (r << 16) | (g << 8) | bl;
};

/** A hue (0..1) at full, bright saturation. */
export const hue = (h: number, s = 0.85, l = 0.58): number => {
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
};

/** A small seeded random source. */
export const seededRandom = (seed: number): (() => number) => {
  let a = (seed | 0) + 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
