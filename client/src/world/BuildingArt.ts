import {
  INTERIOR_HEIGHT,
  WALL,
  doorsOf,
  footprintOf,
  interiorLayout,
  toWorldOf,
  type BuildingSpec,
  type FacadePattern,
  type FloorKind,
} from '@palmhaven/shared';
import { BoxGeometry, CylinderGeometry } from 'three';
import { block, cone, cylinder, mix, shade, wedge } from '../models/shapes.js';
import { buildProp } from '../models/props.js';
import { PartBuilder, type PartKind } from '../render/PartBuilder.js';
import type { FacadeBuilder, FloorBuilder, PavementBuilder } from './meshers.js';
import type { SignBuilder, SignSpec } from './SignAtlas.js';

/**
 * THE LOOK OF EVERY BUILDING, composed from its spec: an Art Deco hotel's
 * window-walled mass (facade shader), its eyebrow ledges, racing stripes,
 * rounded corner tower or fins, neon name and rooftop clutter; a house's
 * gabled roof and porch; a shop's awning and fascia; and, for every building
 * you can walk into, a hollow shell with a floor, painted inner walls, a lit
 * ceiling and its furniture.
 *
 * Buildings only ever face the four compass directions, so local boxes map to
 * world boxes exactly.
 */

export interface BuildKit {
  readonly facade: FacadeBuilder;
  /** Exterior detail (trim, roofs, awnings) - always drawn. */
  readonly parts: PartBuilder;
  /** Interior furniture and small props - hidden at a distance. */
  readonly detail: PartBuilder;
  readonly pave: PavementBuilder;
  readonly floors: FloorBuilder;
  readonly signs: SignBuilder;
}

const PATTERN: Record<FacadePattern, number> = { plain: 0, deco: 1, grid: 2, glass: 3, house: 4, shopfront: 5, industrial: 6 };
/** Interior floors sit this far above the lot (and the patches drawn on it); furniture stands on them. */
export const FLOOR_LIFT = 0.05;

const FLOOR: Record<FloorKind, number> = { tile: 0, wood: 1, marble: 2, checker: 3, carpet: 4, terrazzo: 5, concrete: 6 };
const FLOOR_COLOR: Record<FloorKind, number> = { tile: 0xeef1f4, wood: 0xc08a58, marble: 0xf2efe9, checker: 0xf7f2e8, carpet: 0xb7c4d6, terrazzo: 0xf1e7dc, concrete: 0xb9b6b0 };

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** Local-frame helpers for one building. */
class Frame {
  constructor(readonly b: BuildingSpec) {}

  /** A local box (x/z in the building frame, y above its base) as a world AABB. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): [number, number, number, number, number, number] {
    const a = toWorldOf(this.b, x0, z0);
    const c = toWorldOf(this.b, x1, z1);
    return [Math.min(a.x, c.x), this.b.base + y0, Math.min(a.z, c.z), Math.max(a.x, c.x), this.b.base + y1, Math.max(a.z, c.z)];
  }

  /** A world transform for a local point. */
  t(x: number, y: number, z: number, ry = 0, extra: { rx?: number; rz?: number; sx?: number; sy?: number; sz?: number } = {}): { x: number; y: number; z: number; ry: number; rx?: number; rz?: number; sx?: number; sy?: number; sz?: number } {
    const w = toWorldOf(this.b, x, z);
    return { x: w.x, y: this.b.base + y, z: w.z, ry: this.b.rot + ry, ...extra };
  }

  /** A box part in local coordinates (centre, size). */
  part(p: PartBuilder, w: number, h: number, d: number, color: number, x: number, y: number, z: number, kind: PartKind = 'smooth', ry = 0): void {
    p.add(new BoxGeometry(w, h, d), color, kind, this.t(x, y, z, ry));
  }
}

// ---------------------------------------------------------------- entry

export const buildBuilding = (b: BuildingSpec, kit: BuildKit): void => {
  const f = new Frame(b);
  switch (b.kind) {
    case 'house':
      house(f, kit);
      break;
    case 'lighthouse':
      lighthouse(f, kit);
      break;
    case 'controltower':
      controlTower(f, kit);
      break;
    case 'hangar':
      hangar(f, kit);
      break;
    default:
      mass(f, kit);
      break;
  }
  if (b.interior) interior(f, kit);
};

// ------------------------------------------------------------- massing

/** Walls: a solid facade box, or a hollow shell around the interior. */
const walls = (f: Frame, kit: BuildKit, pattern: number, height: number): void => {
  const b = f.b;
  const hw = b.w / 2;
  const hd = b.d / 2;
  const fp = footprintOf(b);
  if (!b.interior) {
    kit.facade.box(fp.x0, b.base, fp.z0, fp.x1, b.base + height, fp.z1, b.style.wall, pattern, b.seed);
    return;
  }
  const ih = INTERIOR_HEIGHT;
  const T = WALL;
  const add = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, skip = ''): void => {
    const box = f.box(x0, y0, z0, x1, y1, z1);
    kit.facade.box(box[0], box[1], box[2], box[3], box[4], box[5], b.style.wall, pattern, b.seed, y0, skip);
  };
  add(-hw, 0, -hd, hw, ih, -hd + T);
  add(-hw, 0, -hd + T, -hw + T, ih, hd - T);
  add(hw - T, 0, -hd + T, hw, ih, hd - T);
  let cursor = -hw;
  for (const door of doorsOf(b.interior, b.w).sort((a, c) => a.offset - c.offset)) {
    const l = door.offset - door.width / 2;
    const r = door.offset + door.width / 2;
    if (l > cursor) add(cursor, 0, hd - T, l, ih, hd);
    add(l, door.height, hd - T, r, ih, hd);
    // A door frame and a mat.
    f.part(kit.parts, 0.35, door.height, T + 0.2, b.style.trim, l - 0.15, door.height / 2, hd - T / 2);
    f.part(kit.parts, 0.35, door.height, T + 0.2, b.style.trim, r + 0.15, door.height / 2, hd - T / 2);
    f.part(kit.parts, door.width + 0.6, 0.35, T + 0.2, b.style.trim, door.offset, door.height + 0.15, hd - T / 2);
    f.part(kit.detail, Math.min(door.width, 5), 0.05, 1.8, 0x5a4a3c, door.offset, 0.03, hd + 1.2);
    cursor = r;
  }
  if (cursor < hw) add(cursor, 0, hd - T, hw, ih, hd);
  if (height > ih + 0.3) add(-hw, ih, -hd, hw, height, hd);
  else f.part(kit.parts, b.w, 0.6, b.d, b.style.roof, 0, ih + 0.3, 0);
};

const roofClutter = (f: Frame, kit: BuildKit, top: number, w: number, d: number): void => {
  const r = rand(f.b.seed);
  const units = 1 + Math.floor(r() * 3);
  for (let i = 0; i < units; i += 1) {
    const x = (r() - 0.5) * (w - 6);
    const z = (r() - 0.5) * (d - 6);
    f.part(kit.parts, 2.4, 1.4, 2.4, 0xb8bcc2, x, top + 0.7, z);
    f.part(kit.parts, 1.8, 0.2, 1.8, 0x8d9299, x, top + 1.5, z);
  }
  if (r() < 0.45) {
    const x = (r() - 0.5) * (w - 8);
    const z = (r() - 0.5) * (d - 8);
    kit.parts.add(new CylinderGeometry(1.4, 1.4, 2.6, 10), 0x9a7b5c, 'smooth', f.t(x, top + 3.1, z));
    kit.parts.add(new CylinderGeometry(1.5, 0.2, 0.9, 10), 0x7c6248, 'smooth', f.t(x, top + 4.8, z));
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) f.part(kit.parts, 0.2, 1.8, 0.2, 0x6b6b6b, x + dx, top + 0.9, z + dz);
  }
};

/** The commercial and civic massing: deco hotels, condos, the tower, shops, civic buildings. */
const mass = (f: Frame, kit: BuildKit): void => {
  const b = f.b;
  const s = b.style;
  const pattern = PATTERN[s.pattern];
  const h = b.h;
  const hw = b.w / 2;
  const hd = b.d / 2;
  walls(f, kit, pattern, h);

  // Cornice, parapet, base plinth.
  f.part(kit.parts, b.w + 0.8, 0.7, b.d + 0.8, s.trim, 0, h + 0.35, 0);
  f.part(kit.parts, b.w + 0.2, 1.1, 0.3, s.wall, 0, h + 1.2, hd - 0.15);
  f.part(kit.parts, b.w + 0.2, 1.1, 0.3, s.wall, 0, h + 1.2, -hd + 0.15);
  f.part(kit.parts, 0.3, 1.1, b.d, s.wall, hw - 0.15, h + 1.2, 0);
  f.part(kit.parts, 0.3, 1.1, b.d, s.wall, -hw + 0.15, h + 1.2, 0);
  if (!b.interior) f.part(kit.parts, b.w + 0.3, 0.5, b.d + 0.3, shade(s.wall, 0.85), 0, 0.25, 0);

  const deco = b.kind === 'deco' || b.kind === 'motel' || b.kind === 'condo' || b.kind === 'civic' || b.kind === 'school';
  if (deco && h > 9) {
    // Racing stripes and eyebrow ledges across the front.
    const floors = Math.floor(h / 4.5);
    for (let i = 1; i < floors; i += 1) {
      const y = i * 4.5 + 3.8;
      if (y > h - 1) break;
      const band = signBand(b);
      if (band && y + 0.14 > band[0] && y - 0.14 < band[1]) continue;
      f.part(kit.parts, b.w - 1, 0.28, 0.9, shade(s.wall, 0.94), 0, y, hd + 0.4);
    }
    const stripeY = [4.45, h * 0.62];
    for (const y of stripeY) {
      f.part(kit.parts, b.w + 0.12, 0.55, b.d + 0.12, s.trim, 0, y, 0);
    }
  }

  switch (s.ornament) {
    case 'corner': {
      // A rounded corner tower on the front-left, a little taller than the roof.
      const r = Math.min(4.2, Math.min(b.w, b.d) * 0.16);
      const x = hw - r * 0.7;
      const z = hd - r * 0.7;
      kit.parts.add(new CylinderGeometry(r, r, h + 3, 16), s.wall, 'smooth', f.t(x, (h + 3) / 2, z));
      for (let y = 4.5; y < h + 2; y += 4.5) kit.parts.add(new CylinderGeometry(r + 0.15, r + 0.15, 0.5, 16), s.trim, 'smooth', f.t(x, y, z));
      kit.parts.add(new CylinderGeometry(r + 0.3, r + 0.3, 0.6, 16), s.trim, 'smooth', f.t(x, h + 3.3, z));
      cylinder(kit.parts, 0.25, 0.25, 4, s.accent, f.t(x, h + 5.4, z), 'smooth', 6);
      break;
    }
    case 'fins': {
      // Three vertical fins rising over the entrance.
      // On a shop they start above the fascia sign and awning, never through them.
      const shop = b.kind === 'shop' || b.kind === 'storefront';
      const band = signBand(b);
      const y0 = Math.max(shop ? 9.6 : h * 0.45, band ? band[1] + 0.2 : 0);
      const y1 = h + (shop ? 4 : 5);
      if (y1 - y0 < 3) break;
      for (const dx of [-2.2, 0, 2.2]) f.part(kit.parts, 0.7, y1 - y0, 1.4, dx === 0 ? s.accent : s.trim, dx, (y0 + y1) / 2, hd + 0.7);
      break;
    }
    case 'crown': {
      // A stepped crown on the roof.
      const cw = Math.min(b.w * 0.45, 18);
      f.part(kit.parts, cw, 3, Math.min(b.d * 0.4, 12), s.wall, 0, h + 2.2, hd * 0.25);
      f.part(kit.parts, cw * 0.62, 2.6, Math.min(b.d * 0.26, 8), s.trim, 0, h + 5, hd * 0.25);
      f.part(kit.parts, cw * 0.3, 2.2, Math.min(b.d * 0.15, 5), s.wall, 0, h + 7.4, hd * 0.25);
      cylinder(kit.parts, 0.2, 0.2, 5, 0xd8d8d8, f.t(0, h + 11, hd * 0.25), 'smooth', 6);
      break;
    }
    default:
      break;
  }

  // Towers and setbacks.
  let below = h;
  b.tiers?.forEach((tier, i) => {
    const box = f.box(-tier.w / 2, below, -tier.d / 2, tier.w / 2, tier.top, tier.d / 2);
    const tierPattern = b.kind === 'tower' ? PATTERN.glass : pattern;
    const color = b.kind === 'tower' ? (i % 2 === 0 ? mix(s.wall, 0xffffff, 0.15) : s.wall) : s.wall;
    kit.facade.box(box[0], box[1], box[2], box[3], box[4], box[5], color, tierPattern, b.seed + i * 17, below);
    f.part(kit.parts, tier.w + 0.8, 0.6, tier.d + 0.8, s.trim, 0, tier.top + 0.3, 0);
    if (b.kind === 'tower') {
      for (const sx of [-1, 1]) f.part(kit.parts, 0.8, tier.top - below - 0.05, 1.6, s.trim, sx * (tier.w / 2 - 3), (below + tier.top - 0.05) / 2, tier.d / 2 + 0.3);
    }
    below = tier.top;
  });
  if (b.kind === 'tower') {
    cylinder(kit.parts, 0.5, 1.4, 24, 0xf4f4f4, f.t(0, below + 12, 0), 'smooth', 10);
    kit.parts.add(new CylinderGeometry(0.7, 0.7, 1.2, 8), 0xff3b6b, 'glow', f.t(0, below + 24.6, 0));
  }
  roofClutter(f, kit, below + (b.tiers ? 0.6 : 0.7), b.tiers?.at(-1)?.w ?? b.w, b.tiers?.at(-1)?.d ?? b.d);

  // Entrance canopy and awnings.
  if (s.awning !== undefined) awning(f, kit, s.awning, b.w, hd);
  else if (b.kind === 'deco' || b.kind === 'condo' || b.kind === 'motel') {
    f.part(kit.parts, Math.min(10, b.w * 0.4), 0.45, 3.2, s.trim, 0, 5.3, hd + 1.6);
    f.part(kit.parts, Math.min(10, b.w * 0.4) + 0.4, 0.3, 0.3, s.accent, 0, 5.05, hd + 3.1);
    if (!b.interior) f.part(kit.parts, 3.6, 4.4, 0.25, 0x1e2a3a, 0, 2.5, hd + 0.13);
  }

  // Civic touches.
  if (b.interior === 'cityhall' || b.interior === 'bank') {
    for (const x of [-hw * 0.6, -hw * 0.3, hw * 0.3, hw * 0.6]) cylinder(kit.parts, 0.9, 1, 9.5, 0xfdfbf6, f.t(x, 4.75, hd + 2.2), 'smooth', 12);
    f.part(kit.parts, b.w * 0.75, 0.9, 3.2, s.wall, 0, 9.9, hd + 2.2);
    f.part(kit.parts, b.w * 0.8, 0.4, 4.4, shade(s.wall, 0.92), 0, 0.2, hd + 2.2);
  }
  if (b.interior === 'hospital') {
    // A red cross over the entrance and an ambulance canopy.
    f.part(kit.parts, 1.2, 4, 0.4, 0xff3b4c, -12, h - 4, hd + 0.3, 'glow');
    f.part(kit.parts, 4, 1.2, 0.4, 0xff3b4c, -12, h - 4, hd + 0.3, 'glow');
    f.part(kit.parts, 18, 0.6, 7, 0xf2f2f2, 0, 6.2, hd + 3.5);
    for (const x of [-8, 8]) cylinder(kit.parts, 0.35, 0.35, 6, 0xdddddd, f.t(x, 3, hd + 6.4), 'smooth', 8);
  }
  if (b.interior === 'police') {
    f.part(kit.parts, b.w + 0.2, 1.2, b.d + 0.2, 0x2d5bd6, 0, 8.2, 0);
    f.part(kit.parts, 14, 0.5, 4, 0x23395d, 0, 7.8, hd + 2);
  }
  if (b.interior === 'fire') {
    for (const x of [-14, 0, 14]) f.part(kit.parts, 11.6, 0.6, 0.5, 0xffffff, x, 9.5, hd + 0.2);
  }
  if (b.kind === 'motel') {
    // The upper walkway and its railing.
    f.part(kit.parts, b.w, 0.4, 2.6, shade(s.wall, 0.9), 0, 5.2, hd + 1.3);
    f.part(kit.parts, b.w, 0.9, 0.15, s.trim, 0, 6, hd + 2.55);
    for (let x = -hw + 1; x <= hw - 1; x += 8) f.part(kit.parts, 0.3, 5, 0.3, s.trim, x, 2.5, hd + 2.4);
  }
  if (b.kind === 'terminal') {
    f.part(kit.parts, b.w + 8, 0.8, 12, 0xeef2f6, 0, h + 0.4, hd + 2);
    for (let x = -hw; x <= hw; x += 20) cylinder(kit.parts, 0.5, 0.5, h, 0xdfe6ee, f.t(x, h / 2, hd + 7), 'smooth', 8);
  }
  if (b.kind === 'warehouse') {
    for (const x of [-hw * 0.5, hw * 0.5]) f.part(kit.parts, 8, 7.5, 0.3, 0x9aa0a6, x, 3.75, hd + 0.1);
  }

  signFor(f, kit);
};

const awning = (f: Frame, kit: BuildKit, color: number, width: number, hd: number): void => {
  const w = Math.min(width - 2, 16);
  const stripes = Math.max(4, Math.round(w / 1.6));
  for (let i = 0; i < stripes; i += 1) {
    const x = -w / 2 + (i + 0.5) * (w / stripes);
    wedge(kit.parts, w / stripes, 1.4, 3, i % 2 === 0 ? color : 0xffffff, f.t(x, 6.4, hd + 1.5, Math.PI, { rx: 0 }));
  }
  f.part(kit.parts, w, 0.5, 0.2, color, 0, 5.6, hd + 3);
};

/**
 * The height band the building's front sign occupies (with a margin), or null
 * when it has none on the facade. Ledges and fins keep out of it, so no name
 * is ever crossed by the building's own ornament.
 */
const signBand = (b: BuildingSpec): readonly [number, number] | null => {
  const name = b.sign ?? (b.kind === 'deco' || b.kind === 'condo' ? b.name : '');
  if (!name || name === 'Private Residence') return null;
  let y: number;
  let height: number;
  if (b.kind === 'deco' || b.kind === 'condo' || b.kind === 'motel') {
    if (b.style.ornament === 'fins' && b.h > 14) return null; // a blade sign, in front of the fins
    y = Math.max(7.2, b.h - 1.8);
    height = 2.6;
  } else if (b.kind === 'shop' || b.kind === 'storefront' || b.kind === 'kiosk') {
    y = b.kind === 'kiosk' ? b.h - 1.6 : 8.1;
    height = 2;
  } else {
    y = Math.min(b.h - 1.5, 12.2);
    height = 2.4;
  }
  return [y - height / 2 - 0.35, y + height / 2 + 0.35];
};

/** The building's name: neon script for hotels, a fascia for shops, deco capitals for civic buildings. */
const signFor = (f: Frame, kit: BuildKit): void => {
  const b = f.b;
  const s = b.style;
  const hd = b.d / 2;
  const name = b.sign ?? (b.kind === 'deco' || b.kind === 'condo' ? b.name : '');
  if (!name || name === 'Private Residence') return;
  let spec: SignSpec;
  let y: number;
  let height: number;
  if (b.kind === 'deco' || b.kind === 'condo' || b.kind === 'motel') {
    spec = { text: name, style: 'neon', fg: hex(s.trim) };
    if (s.ornament === 'fins' && b.h > 14) {
      kit.signs.add(spec, f.t(0, b.h * 0.62, hd + 1.45).x, b.base + b.h * 0.62, f.t(0, 0, hd + 1.45).z, b.rot, 2.2, b.h * 0.6, true);
      return;
    }
    y = Math.max(7.2, b.h - 1.8);
    height = 2.6;
  } else if (b.kind === 'shop' || b.kind === 'storefront' || b.kind === 'kiosk') {
    spec = { text: name, style: 'fascia', fg: '#ffffff', bg: hex(s.awning ?? s.trim) };
    y = b.kind === 'kiosk' ? b.h - 1.6 : 8.1;
    height = 2;
  } else {
    spec = { text: name, style: 'deco', fg: hex(s.trim === 0xffffff ? s.accent : s.trim) };
    y = Math.min(b.h - 1.5, 12.2);
    height = 2.4;
  }
  const at = f.t(0, y, hd + 0.08);
  kit.signs.add(spec, at.x, at.y, at.z, b.rot, height, b.w * 0.82);
};

// ---------------------------------------------------------------- houses

const house = (f: Frame, kit: BuildKit): void => {
  const b = f.b;
  const s = b.style;
  const hw = b.w / 2;
  const hd = b.d / 2;
  const enterable = b.interior !== null;
  // Ground floor walls (hollow when enterable), then a second storey for tall houses.
  walls(f, kit, PATTERN.house, b.h);
  f.part(kit.parts, b.w + 0.4, 0.5, b.d + 0.4, shade(s.wall, 0.8), 0, 0.25, 0);
  if (s.roofKind === 'gable' || s.roofKind === 'hip') {
    const rise = Math.min(b.w, b.d) * 0.36;
    const eave = 1.2;
    if (s.roofKind === 'gable') {
      // Ridge across the width: two sloped wedges.
      wedge(kit.parts, b.w + eave * 2, rise, hd + eave, s.roof, f.t(0, b.h + rise / 2, (hd + eave) / 2, Math.PI));
      wedge(kit.parts, b.w + eave * 2, rise, hd + eave, s.roof, f.t(0, b.h + rise / 2, -(hd + eave) / 2, 0));
      // Gable ends.
      for (const sx of [-1, 1]) {
        const g = new BoxGeometry(0.4, rise, b.d).toNonIndexed();
        const pos = g.getAttribute('position');
        for (let i = 0; i < pos.count; i += 1) if (pos.getY(i) > 0) pos.setZ(i, 0);
        g.computeVertexNormals();
        kit.parts.add(g, s.wall, 'smooth', f.t(sx * (hw - 0.2), b.h + rise / 2, 0));
      }
    } else {
      const radius = Math.hypot(hw, hd) + eave;
      const pyramid = new CylinderGeometry(0.01, radius, rise, 4, 1);
      pyramid.rotateY(Math.PI / 4);
      kit.parts.add(pyramid, s.roof, 'smooth', { ...f.t(0, b.h + rise / 2, 0), sx: ((hw + eave) / radius) * Math.SQRT2, sz: ((hd + eave) / radius) * Math.SQRT2 });
    }
    f.part(kit.parts, b.w + eave * 2, 0.3, b.d + eave * 2, shade(s.roof, 0.8), 0, b.h + 0.1, 0);
    if (rand(b.seed)() < 0.5) f.part(kit.parts, 1.6, rise + 2, 1.6, 0xb5654a, hw * 0.5, b.h + rise * 0.6, -hd * 0.3);
  } else {
    // Flat roofs: a parapet and, on townhouses, a little roof garden.
    f.part(kit.parts, b.w + 0.4, 0.8, b.d + 0.4, s.trim, 0, b.h + 0.4, 0);
    f.part(kit.parts, b.w - 2, 0.5, b.d - 2, 0x76b85a, 0, b.h + 0.6, 0);
  }
  // A porch roof over the front door, with posts.
  const porchW = Math.min(10, b.w * 0.5);
  f.part(kit.parts, porchW, 0.4, 3.4, s.awning ?? s.trim, 0, 7.6, hd + 1.7);
  for (const sx of [-1, 1]) f.part(kit.parts, 0.35, 7.4, 0.35, 0xffffff, sx * (porchW / 2 - 0.3), 3.7, hd + 3.2);
  f.part(kit.parts, porchW, 0.3, 3.6, 0xd8cbb8, 0, 0.15, hd + 1.8);
  // Window boxes with flowers on the front.
  for (const sx of [-1, 1]) {
    const x = sx * Math.min(hw - 2.5, 6.5);
    f.part(kit.parts, 2.6, 0.5, 0.6, 0x8a5a3a, x, 1.1, hd + 0.35);
    f.part(kit.parts, 2.4, 0.4, 0.5, 0xff5d8f, x, 1.5, hd + 0.35, 'leaf');
  }
  if (!enterable) f.part(kit.parts, 3.6, 6.6, 0.3, shade(s.accent, 0.75), 0, 3.3, hd + 0.16);
  // Family homes get a garage door.
  if (b.w >= 28) f.part(kit.parts, 8, 6.4, 0.25, 0xf2f2f2, -hw + 5.5, 3.2, hd + 0.13);
};

// ------------------------------------------------------------- landmarks

const lighthouse = (f: Frame, kit: BuildKit): void => {
  const b = f.b;
  const bands = 6;
  for (let i = 0; i < bands; i += 1) {
    const y0 = (b.h / bands) * i;
    const r0 = 5.5 - (2.2 * y0) / b.h;
    const r1 = 5.5 - (2.2 * (y0 + b.h / bands)) / b.h;
    kit.parts.add(new CylinderGeometry(r1, r0, b.h / bands, 16), i % 2 === 0 ? 0xffffff : 0xe53e3e, 'smooth', f.t(0, y0 + b.h / bands / 2, 0));
  }
  kit.parts.add(new CylinderGeometry(4.6, 4.6, 0.6, 16), 0x2b2b2b, 'smooth', f.t(0, b.h + 0.3, 0));
  kit.parts.add(new CylinderGeometry(7, 7, 1.2, 16), 0xf2f2f2, 'smooth', f.t(0, 0.6, 0));
  f.part(kit.parts, 2.4, 4, 0.3, 0x2f4f6f, 0, 2.2, 5.2);
};

const controlTower = (f: Frame, kit: BuildKit): void => {
  const b = f.b;
  cylinder(kit.parts, 2.6, 3.4, b.h, 0xeef2f6, f.t(0, b.h / 2, 0), 'smooth', 12);
  kit.parts.add(new CylinderGeometry(6, 4.4, 5, 8), 0x5ec8f2, 'smooth', f.t(0, b.h + 2.5, 0));
  kit.parts.add(new CylinderGeometry(6.6, 6.6, 0.8, 8), 0xffffff, 'smooth', f.t(0, b.h + 5.4, 0));
  cone(kit.parts, 1, 3, 0xd8d8d8, f.t(0, b.h + 7.2, 0), 'smooth', 8);
  kit.parts.add(new CylinderGeometry(0.4, 0.4, 0.6, 6), 0xff3b3b, 'glow', f.t(0, b.h + 8.9, 0));
};

const hangar = (f: Frame, kit: BuildKit): void => {
  const b = f.b;
  const hw = b.w / 2;
  walls(f, kit, PATTERN.industrial, INTERIOR_HEIGHT + 0.6);
  // An arched roof over the bay.
  const arch = new CylinderGeometry(hw, hw, b.d, 16, 1, false, -Math.PI / 2, Math.PI);
  kit.parts.add(arch, b.style.roof, 'smooth', f.t(0, INTERIOR_HEIGHT + 0.6, 0, 0, { rx: -Math.PI / 2 }));
  f.part(kit.parts, 2, 1, b.d, b.style.trim, 0, INTERIOR_HEIGHT + 0.6 + hw - 0.3, 0);
  signFor(f, kit);
};

// -------------------------------------------------------------- interiors

const interior = (f: Frame, kit: BuildKit): void => {
  const b = f.b;
  const kind = b.interior!;
  const layout = interiorLayout(kind, b.w, b.d);
  const hw = b.w / 2 - WALL;
  const hd = b.d / 2 - WALL;
  const ih = INTERIOR_HEIGHT;
  // The floor.
  const corners = [toWorldOf(b, -hw, -hd), toWorldOf(b, hw, -hd), toWorldOf(b, hw, hd), toWorldOf(b, -hw, hd)].map((p) => [p.x, p.z] as const);
  const floorKind: FloorKind = kind === 'home' ? 'wood' : layout.floor;
  // Above the lot patches (curb + 0.025) the building stands on.
  kit.floors.quad(corners, b.base + FLOOR_LIFT, FLOOR_COLOR[floorKind], FLOOR[floorKind]);
  // Painted inner walls, a skirting board, the ceiling and its lights.
  const wallColor = kind === 'home' ? mix(b.style.wall, 0xffffff, 0.55) : layout.wall;
  const inset = 0.04;
  f.part(kit.detail, b.w - WALL * 2, ih, 0.08, wallColor, 0, ih / 2, -hd + inset);
  f.part(kit.detail, 0.08, ih, b.d - WALL * 2, wallColor, -hw + inset, ih / 2, 0);
  f.part(kit.detail, 0.08, ih, b.d - WALL * 2, wallColor, hw - inset, ih / 2, 0);
  let cursor = -b.w / 2;
  for (const door of doorsOf(kind, b.w).sort((a, c) => a.offset - c.offset)) {
    const l = door.offset - door.width / 2;
    const r = door.offset + door.width / 2;
    if (l > cursor + 0.9) f.part(kit.detail, l - Math.max(cursor, -hw), ih, 0.08, wallColor, (l + Math.max(cursor, -hw)) / 2, ih / 2, hd - inset);
    f.part(kit.detail, door.width, ih - door.height, 0.08, wallColor, door.offset, (ih + door.height) / 2, hd - inset);
    cursor = r;
  }
  if (cursor < hw - 0.9) f.part(kit.detail, hw - cursor, ih, 0.08, wallColor, (hw + cursor) / 2, ih / 2, hd - inset);
  f.part(kit.detail, b.w - WALL * 2, 0.6, 0.12, shade(wallColor, 0.7), 0, 0.3, -hd + 0.1);
  f.part(kit.detail, b.w - WALL * 2, 0.1, b.d - WALL * 2, 0xfbfbf8, 0, ih - 0.05, 0);
  const lightsX = Math.max(1, Math.floor(b.w / 12));
  const lightsZ = Math.max(1, Math.floor(b.d / 12));
  for (let i = 0; i < lightsX; i += 1) {
    for (let j = 0; j < lightsZ; j += 1) {
      const x = -hw + ((i + 0.5) * (hw * 2)) / lightsX;
      const z = -hd + ((j + 0.5) * (hd * 2)) / lightsZ;
      f.part(kit.detail, 3, 0.12, 1.2, 0xfff7e0, x, ih - 0.12, z, 'glow');
    }
  }
  // Furniture and fittings.
  for (const lp of layout.props) {
    const at = f.t(lp.x, 0, lp.z, lp.rot ?? 0);
    const sub = new PartBuilder();
    buildProp(sub, lp.key);
    // Stood ON the raised floor, so a rug or a foot never meets it flush.
    kit.detail.absorb(sub, { x: at.x, y: at.y + FLOOR_LIFT, z: at.z, ry: at.ry });
  }
  for (const wall of layout.walls ?? []) {
    const box = f.box(wall.x0, 0, wall.z0, wall.x1, wall.h ?? ih, wall.z1);
    kit.detail.add(new BoxGeometry(box[3] - box[0], box[4] - box[1], box[5] - box[2]), wallColor, 'smooth', { x: (box[0] + box[3]) / 2, y: (box[1] + box[4]) / 2, z: (box[2] + box[5]) / 2 });
  }
  // A touch of decor: wall art behind counters, a rug in lobbies.
  if (kind !== 'home' && kind !== 'hangar' && kind !== 'depot' && kind !== 'fire') {
    f.part(kit.detail, 4, 2.6, 0.12, 0xffffff, hw * 0.55, 5.6, -hd + 0.14);
    f.part(kit.detail, 3.6, 2.2, 0.14, mix(b.style.trim, 0x3fb6a8, 0.3), hw * 0.55, 5.6, -hd + 0.2);
  }
};

/** A small deterministic random source per building. */
const rand = (seed: number): (() => number) => {
  let a = (seed | 0) + 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
