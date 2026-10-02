import { rng } from '../util/random.js';
import {
  AIRPORT,
  AIRPORT_BLVD_X,
  AVENUES,
  BEACH_X0,
  BLOCKS,
  BRIDGE,
  CAUSEWAY_Z,
  CURB,
  INTERSECTIONS,
  ISLAND,
  MAINLAND_SHORE,
  ROAD_HALF,
  SIDEWALK,
  STREETS,
  blockAt,
  isLand,
  type Block,
} from './layout.js';
import {
  bayWidth,
  footprintOf,
  type BuildingKind,
  type BuildingSpec,
  type BuildingStyle,
  type Dock,
  type GroundPatch,
  type Landmark,
  type Palm,
  type ParkedVehicle,
  type PatchKind,
  type Ramp,
  type Signal,
  type Tier,
  type Tree,
} from './buildings.js';
import { HOUSE_STYLES, type HousePlot, type HouseStyle } from './houses.js';
import type { InteriorKind } from './interiors.js';
import type { PropPlacement } from './props.js';
import type { ShopId } from '../config/shops.js';

/**
 * THE CITY PLAN: every building, lot, park, palm, parked car, dock and
 * landmark in Palmhaven, generated deterministically from `layout.ts`.
 *
 * Hand-designed districts (which block holds the hospital, where the marina
 * is) with seeded variety inside them (which pastel a hotel is painted, how
 * many floors it has). Same seed, same city - on the server and on every
 * client.
 */

export interface StreetLamp {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  readonly rot: number;
}

export interface CityPlan {
  readonly buildings: BuildingSpec[];
  readonly patches: GroundPatch[];
  readonly props: PropPlacement[];
  readonly parked: ParkedVehicle[];
  readonly docks: Dock[];
  readonly ramps: Ramp[];
  readonly palms: Palm[];
  readonly trees: Tree[];
  readonly lamps: StreetLamp[];
  readonly signals: Signal[];
  readonly landmarks: Landmark[];
  readonly houses: HousePlot[];
  /** Extra solid boxes (bridge rails, canopy columns, the ferris wheel's foot). */
  readonly solids: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }[];
}

const H = Math.PI / 2;
const P = Math.PI;

type Side = 'n' | 's' | 'e' | 'w';
const ROT: Record<Side, number> = { n: P, s: 0, e: H, w: -H };

// ------------------------------------------------------------------ palette

const DECO_WALLS = [0xfbf5ea, 0xf9c6d3, 0xffd9b5, 0xc5eedd, 0xfff0ad, 0xcbe2fb, 0xe0d4f7, 0xffffff, 0xf7e1ef, 0xd9f3f0];
const DECO_TRIM = [0xff6f91, 0x2bb3a3, 0xffc53d, 0x5fb4f2, 0xff8a3d, 0xa47ef0, 0x38c1d6, 0xf25f5c];
const HOUSE_WALLS = [0xfff4e0, 0xf6d6c8, 0xd8ecf5, 0xe6f2dc, 0xfde2c4, 0xf0e0f6, 0xfafafa, 0xffe8a8, 0xcde8e3];
const ROOFS = [0xc9563c, 0x8b5e3c, 0x7a8590, 0x4e6b8a, 0xb0473f, 0x9c7b5b];
const CARS = ['sedan', 'sedan', 'suv', 'pickup', 'convertible', 'luxury', 'sedan', 'suv'] as const;
const CAR_PAINTS = [0xf2f2f2, 0xd94a4a, 0x3a7bd5, 0x2f2f36, 0x58c27d, 0xf5c542, 0x8c2f4b, 0x9aa0a6, 0xff6f91, 0x6fd3c4, 0x1f2a44, 0xe9e4da];

const HOTEL_NAMES = [
  'The Flamingo', 'Coral Sands', 'Hotel Azure', 'The Palmetto', 'Starlite', 'Breakwater', 'Sun Deck Inn', 'Pastel Lodge', 'Ocean Grand',
  'The Tidewater', 'Seashell', 'The Marlin', 'Moonglow', 'Hotel Lido', 'Sea Breeze', 'The Carlyle', 'Avalon', 'Majestic', 'Crescent',
  'The Waverly', 'Neptune', 'Bluewater', 'The Shoreline', 'Pelican', 'Driftwood', 'Sandpiper', 'The Sterling', 'Riviera', 'Atlantis',
];

const STORE_NAMES = ['Surf Shack', 'Pastelito Bakery', 'Palm Pharmacy', 'Ocean Tattoo', 'Sunny Laundry', 'Gelato Mio', 'Tropic Tees', 'Book Nook'];

class Planner implements CityPlan {
  readonly buildings: BuildingSpec[] = [];
  readonly patches: GroundPatch[] = [];
  readonly props: PropPlacement[] = [];
  readonly parked: ParkedVehicle[] = [];
  readonly docks: Dock[] = [];
  readonly ramps: Ramp[] = [];
  readonly palms: Palm[] = [];
  readonly trees: Tree[] = [];
  readonly lamps: StreetLamp[] = [];
  readonly signals: Signal[] = [];
  readonly landmarks: Landmark[] = [];
  readonly houses: HousePlot[] = [];
  readonly solids: CityPlan['solids'] = [];
  private hotelIndex = 0;
  private storeIndex = 0;
  /** Sidewalk stretches kept clear (parking-lot entries), per block. */
  readonly gaps = new Map<number, { side: Side; from: number; to: number }[]>();

  building(spec: Omit<BuildingSpec, 'id' | 'base'> & { base?: number }): BuildingSpec {
    const full: BuildingSpec = { ...spec, base: spec.base ?? CURB, id: this.buildings.length };
    this.buildings.push(full);
    return full;
  }

  prop(key: string, x: number, z: number, rot = 0, y = CURB): void {
    this.props.push({ key, x, y, z, rot });
  }

  patch(kind: PatchKind, x0: number, z0: number, x1: number, z1: number, y?: number): void {
    this.patches.push({ kind, x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), ...(y === undefined ? {} : { y }) });
  }

  palm(x: number, z: number, r: () => number, y = CURB, height = 0): void {
    this.palms.push({ x, z, y, height: height || 10 + r() * 7, lean: (r() - 0.5) * 0.35, yaw: r() * Math.PI * 2 });
  }

  tree(x: number, z: number, r: () => number, y = CURB, kind: Tree['kind'] = 'round'): void {
    this.trees.push({ x, z, y, size: 0.8 + r() * 0.5, kind });
  }

  park(key: string, x: number, z: number, rot: number, paint: number, floating = false): void {
    this.parked.push({ key, x, z, rot, paint, ...(floating ? { floating } : {}) });
  }

  gap(block: Block, side: Side, from: number, to: number): void {
    const list = this.gaps.get(block.id) ?? [];
    list.push({ side, from, to });
    this.gaps.set(block.id, list);
  }

  hotelName(): string {
    const name = HOTEL_NAMES[this.hotelIndex % HOTEL_NAMES.length]!;
    this.hotelIndex += 1;
    return name;
  }

  storeName(): string {
    const name = STORE_NAMES[this.storeIndex % STORE_NAMES.length]!;
    this.storeIndex += 1;
    return name;
  }
}

const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length) % list.length]!;

/** Block-local coordinates: u east from the block's west edge, v south from its north edge. */
const U = (b: Block, u: number): number => b.r.x0 + u;
const V = (b: Block, v: number): number => b.r.z0 + v;
const W = (b: Block): number => b.r.x1 - b.r.x0;
const D = (b: Block): number => b.r.z1 - b.r.z0;

/**
 * The centre of a building of local size (w across its front, d deep) set
 * against a block side, `along` its centre along that side (block-local), and
 * `setback` back from the inner edge of the sidewalk.
 */
const against = (b: Block, side: Side, along: number, w: number, d: number, setback = 0): { x: number; z: number; rot: number } => {
  void w;
  switch (side) {
    case 'e':
      return { x: b.r.x1 - SIDEWALK - setback - d / 2, z: V(b, along), rot: ROT.e };
    case 'w':
      return { x: b.r.x0 + SIDEWALK + setback + d / 2, z: V(b, along), rot: ROT.w };
    case 'n':
      return { x: U(b, along), z: b.r.z0 + SIDEWALK + setback + d / 2, rot: ROT.n };
    case 's':
      return { x: U(b, along), z: b.r.z1 - SIDEWALK - setback - d / 2, rot: ROT.s };
  }
};

/** The street (or avenue) a block side faces. */
const streetOf = (b: Block, side: Side): string => {
  if (b.col >= 0 && b.col <= 2) {
    if (side === 'n') return STREETS[b.row]!.name;
    if (side === 's') return STREETS[b.row + 1]!.name;
    if (side === 'w') return AVENUES[b.col]!.name;
    return AVENUES[b.col + 1]!.name;
  }
  return AVENUES[0]!.name;
};

const decoStyle = (r: () => number, pattern: BuildingStyle['pattern'] = 'deco'): BuildingStyle => ({
  wall: pick(r, DECO_WALLS),
  trim: pick(r, DECO_TRIM),
  accent: pick(r, DECO_TRIM),
  roof: 0xe9e4da,
  pattern,
  roofKind: 'flat',
  ornament: pick(r, ['corner', 'fins', 'crown', 'fins', 'corner'] as const),
});

// ------------------------------------------------------------------ pieces

/** A row of art deco buildings along one side of a block. */
const decoRow = (p: Planner, b: Block, side: Side, widths: readonly number[], depth: number, floors: [number, number], r: () => number, gapSize = 3.2): void => {
  const along = side === 'e' || side === 'w' ? D(b) : W(b);
  const total = widths.reduce((a, w) => a + w, 0) + gapSize * (widths.length - 1);
  let cursor = (along - total) / 2;
  for (const w of widths) {
    const at = against(b, side, cursor + w / 2, w, depth);
    const f = floors[0] + Math.floor(r() * (floors[1] - floors[0] + 1));
    const style = decoStyle(r);
    p.building({ kind: 'deco', name: p.hotelName(), ...at, w, d: depth, h: f * 4.5 + 1.6, style, interior: null, seed: Math.floor(r() * 1e9) });
    cursor += w + gapSize;
  }
};

/** A parking lot: a patch, rows of parked cars, and a gap in the sidewalk furniture where cars drive in. */
const parkingLot = (p: Planner, b: Block, x0: number, z0: number, x1: number, z1: number, r: () => number, fill = 0.6, entry?: Side): void => {
  p.patch('parking', x0, z0, x1, z1);
  const horizontal = x1 - x0 > z1 - z0;
  const span = horizontal ? x1 - x0 : z1 - z0;
  const across = horizontal ? z1 - z0 : x1 - x0;
  const slots = Math.floor((span - 4) / 6);
  const rows = across >= 30 ? 2 : 1;
  for (let row = 0; row < rows; row += 1) {
    for (let i = 0; i < slots; i += 1) {
      if (r() > fill) continue;
      const a = (horizontal ? x0 : z0) + 2 + 3 + i * 6;
      const c = rows === 2 ? (row === 0 ? (horizontal ? z0 : x0) + 6 : (horizontal ? z1 : x1) - 6) : (horizontal ? (z0 + z1) / 2 : (x0 + x1) / 2);
      const key = pick(r, CARS);
      const facing = rows === 2 ? (row === 0 ? 1 : -1) : r() < 0.5 ? 1 : -1;
      const rot = horizontal ? (facing > 0 ? 0 : P) : facing > 0 ? H : -H;
      p.park(key, horizontal ? a : c, horizontal ? c : a, rot, pick(r, CAR_PAINTS));
    }
  }
  if (entry) {
    const mid = entry === 'n' || entry === 's' ? (x0 + x1) / 2 - b.r.x0 : (z0 + z1) / 2 - b.r.z0;
    p.gap(b, entry, mid - 9, mid + 9);
  }
};

/** A house on a lot facing a street, with lawn, driveway, mailbox and a tree out back. */
const houseLot = (
  p: Planner,
  b: Block,
  side: Side,
  along: number,
  lotWidth: number,
  depthAvail: number,
  style: HouseStyle,
  claim: boolean,
  r: () => number,
): void => {
  const def = HOUSE_STYLES[style];
  const setback = Math.max(4, Math.min(9, depthAvail - def.d - 6));
  const at = against(b, side, along, def.w, def.d, setback);
  const wall = pick(r, HOUSE_WALLS);
  const roofKind: BuildingStyle['roofKind'] = style === 'villa' ? 'flat' : r() < 0.5 ? 'gable' : 'hip';
  const houseIndex = claim ? p.houses.length : undefined;
  const number = 100 + Math.round(Math.abs(side === 'e' || side === 'w' ? at.z : at.x) / 2);
  const address = `${number} ${streetOf(b, side)}`;
  const spec = p.building({
    kind: 'house',
    name: claim ? address : 'Private Residence',
    ...at,
    w: def.w,
    d: def.d,
    h: def.h,
    style: { wall, trim: 0xffffff, accent: pick(r, DECO_TRIM), roof: pick(r, ROOFS), pattern: 'house', roofKind, ornament: 'none' },
    interior: claim ? 'home' : null,
    ...(houseIndex === undefined ? {} : { house: houseIndex }),
    seed: Math.floor(r() * 1e9),
  });
  if (houseIndex !== undefined) {
    p.houses.push({ id: houseIndex, style, building: spec.id, address, x: at.x, z: at.z, rot: at.rot, base: CURB });
  }
  // The lot: lawn, front walk, driveway beside the house, hedges along the sides.
  const fp = footprintOf(spec);
  const half = lotWidth / 2;
  const lot = lotRect(b, side, along, half, depthAvail);
  p.patch('grass', lot.x0, lot.z0, lot.x1, lot.z1);
  const walk = frontStrip(spec, side, b);
  p.patch('plaza', walk.x0, walk.z0, walk.x1, walk.z1);
  // Mailbox by the sidewalk, a flamingo on some lawns.
  const front = frontPoint(spec, side, b, 1.6);
  const off = side === 'e' || side === 'w' ? { x: 0, z: 3.4 } : { x: 3.4, z: 0 };
  p.prop('mailbox', front.x + off.x, front.z + off.z, spec.rot);
  if (r() < 0.35) p.prop('flamingo', front.x - off.x * 1.6, front.z - off.z * 1.6, spec.rot + 0.6);
  // Back garden trees and a hedge down one side.
  const back = backPoint(spec, side, 5);
  if (inBlock(b, back.x, back.z, 3)) p.tree(back.x, back.z, r, CURB, r() < 0.5 ? 'round' : 'shrub');
  if (r() < 0.6) p.palm(fp.x0 - (side === 'n' || side === 's' ? 3 : 0), fp.z0 - (side === 'e' || side === 'w' ? 3 : 0), r);
};

const inBlock = (b: Block, x: number, z: number, pad = 0): boolean => x > b.r.x0 + pad && x < b.r.x1 - pad && z > b.r.z0 + pad && z < b.r.z1 - pad;

const lotRect = (b: Block, side: Side, along: number, half: number, depth: number): { x0: number; z0: number; x1: number; z1: number } => {
  switch (side) {
    case 'e':
      return { x0: b.r.x1 - SIDEWALK - depth, x1: b.r.x1 - SIDEWALK, z0: V(b, along - half + 0.5), z1: V(b, along + half - 0.5) };
    case 'w':
      return { x0: b.r.x0 + SIDEWALK, x1: b.r.x0 + SIDEWALK + depth, z0: V(b, along - half + 0.5), z1: V(b, along + half - 0.5) };
    case 'n':
      return { x0: U(b, along - half + 0.5), x1: U(b, along + half - 0.5), z0: b.r.z0 + SIDEWALK, z1: b.r.z0 + SIDEWALK + depth };
    case 's':
      return { x0: U(b, along - half + 0.5), x1: U(b, along + half - 0.5), z0: b.r.z1 - SIDEWALK - depth, z1: b.r.z1 - SIDEWALK };
  }
};

/** The strip from a building's door to the sidewalk. */
const frontStrip = (spec: BuildingSpec, side: Side, b: Block): { x0: number; z0: number; x1: number; z1: number } => {
  const fp = footprintOf(spec);
  switch (side) {
    case 'e':
      return { x0: fp.x1, x1: b.r.x1 - SIDEWALK, z0: spec.z - 1.6, z1: spec.z + 1.6 };
    case 'w':
      return { x0: b.r.x0 + SIDEWALK, x1: fp.x0, z0: spec.z - 1.6, z1: spec.z + 1.6 };
    case 'n':
      return { x0: spec.x - 1.6, x1: spec.x + 1.6, z0: b.r.z0 + SIDEWALK, z1: fp.z0 };
    case 's':
      return { x0: spec.x - 1.6, x1: spec.x + 1.6, z0: fp.z1, z1: b.r.z1 - SIDEWALK };
  }
};

const frontPoint = (spec: BuildingSpec, side: Side, b: Block, fromSidewalk: number): { x: number; z: number } => {
  switch (side) {
    case 'e':
      return { x: b.r.x1 - SIDEWALK - fromSidewalk, z: spec.z };
    case 'w':
      return { x: b.r.x0 + SIDEWALK + fromSidewalk, z: spec.z };
    case 'n':
      return { x: spec.x, z: b.r.z0 + SIDEWALK + fromSidewalk };
    case 's':
      return { x: spec.x, z: b.r.z1 - SIDEWALK - fromSidewalk };
  }
};

const backPoint = (spec: BuildingSpec, side: Side, beyond: number): { x: number; z: number } => {
  const fp = footprintOf(spec);
  switch (side) {
    case 'e':
      return { x: fp.x0 - beyond, z: spec.z };
    case 'w':
      return { x: fp.x1 + beyond, z: spec.z };
    case 'n':
      return { x: spec.x, z: fp.z1 + beyond };
    case 's':
      return { x: spec.x, z: fp.z0 - beyond };
  }
};

/** A suburban block: three houses facing the street on each long side. */
const housesBlock = (p: Planner, b: Block, claims: readonly number[], styles: readonly HouseStyle[], r: () => number, sides: [Side, Side] = ['n', 's']): void => {
  const horizontal = sides[0] === 'n';
  const along = horizontal ? W(b) - SIDEWALK * 2 : D(b) - SIDEWALK * 2;
  const depth = ((horizontal ? D(b) : W(b)) - SIDEWALK * 2) / 2;
  let index = 0;
  for (const side of sides) {
    const count = styles.length;
    const lot = along / count;
    for (let i = 0; i < count; i += 1) {
      const centre = SIDEWALK + lot * (i + 0.5);
      houseLot(p, b, side, centre, lot, depth, styles[i]!, claims.includes(index), r);
      index += 1;
    }
  }
};

/** A row of townhouse units (each one a claimable home). */
const townhouseRow = (p: Planner, b: Block, side: Side, centre: number, units: number, r: () => number, setback = 4): void => {
  const def = HOUSE_STYLES.townhouse;
  const start = centre - (units * def.w) / 2;
  const palette = [pick(r, DECO_WALLS), pick(r, DECO_WALLS), pick(r, DECO_WALLS), pick(r, DECO_WALLS)];
  for (let i = 0; i < units; i += 1) {
    const at = against(b, side, start + def.w * (i + 0.5), def.w, def.d, setback);
    const houseIndex = p.houses.length;
    const number = 100 + Math.round(Math.abs(side === 'e' || side === 'w' ? at.z : at.x) / 2);
    const address = `${number} ${streetOf(b, side)}`;
    const spec = p.building({
      kind: 'house',
      name: address,
      ...at,
      w: def.w,
      d: def.d,
      h: def.h,
      style: { wall: palette[i % palette.length]!, trim: 0xffffff, accent: pick(r, DECO_TRIM), roof: 0xe9e4da, pattern: 'house', roofKind: 'flat', ornament: 'none', awning: pick(r, DECO_TRIM) },
      interior: 'home',
      house: houseIndex,
      seed: Math.floor(r() * 1e9),
    });
    p.houses.push({ id: houseIndex, style: 'townhouse', building: spec.id, address, x: at.x, z: at.z, rot: at.rot, base: CURB });
    const walk = frontStrip(spec, side, b);
    p.patch('plaza', walk.x0, walk.z0, walk.x1, walk.z1);
    const fp = footprintOf(spec);
    if (side === 'n' || side === 's') {
      const z0 = side === 'n' ? b.r.z0 + SIDEWALK : fp.z1;
      const z1 = side === 'n' ? fp.z0 : b.r.z1 - SIDEWALK;
      p.patch('garden', fp.x0 + 0.6, z0, spec.x - 2, z1);
      p.patch('garden', spec.x + 2, z0, fp.x1 - 0.6, z1);
    } else {
      const x0 = side === 'w' ? b.r.x0 + SIDEWALK : fp.x1;
      const x1 = side === 'w' ? fp.x0 : b.r.x1 - SIDEWALK;
      p.patch('garden', x0, fp.z0 + 0.6, x1, spec.z - 2);
      p.patch('garden', x0, spec.z + 2, x1, fp.z1 - 0.6);
    }
  }
};

/** A deco hotel block on Ocean Drive. */
const hotelBlock = (p: Planner, b: Block, r: () => number, courtyard: 'parking' | 'pool', eastWidths: readonly number[] = [bayWidth(25), bayWidth(29), bayWidth(25)]): void => {
  decoRow(p, b, 'e', eastWidths, 32, [4, 7], r);
  decoRow(p, b, 'w', [bayWidth(37), bayWidth(41)], 28, [3, 5], r, 7.6);
  const x0 = U(b, SIDEWALK + 28 + 3);
  const x1 = U(b, W(b) - SIDEWALK - 32 - 3);
  if (courtyard === 'parking') {
    parkingLot(p, b, x0, V(b, SIDEWALK + 2), x1, V(b, D(b) - SIDEWALK - 2), r, 0.55, 's');
  } else {
    p.patch('deck', x0, V(b, SIDEWALK + 2), x1, V(b, D(b) - SIDEWALK - 2));
    const cx = (x0 + x1) / 2;
    const cz = V(b, D(b) / 2);
    p.patch('pool', cx - 12, cz - 16, cx + 12, cz + 16);
    for (let i = 0; i < 5; i += 1) {
      p.prop('sun_lounger', cx - 17, cz - 14 + i * 7, H);
      p.prop('sun_lounger', cx + 17, cz - 14 + i * 7, -H);
    }
    p.prop('beach_umbrella', cx - 17, cz - 17.5);
    p.prop('beach_umbrella', cx + 17, cz + 17.5);
    for (const dz of [-30, 30]) p.palm(cx - 10, cz + dz, r);
    for (const dz of [-30, 30]) p.palm(cx + 10, cz + dz, r);
  }
};

const condoTower = (p: Planner, name: string, x: number, z: number, w: number, d: number, rot: number, top: number, r: () => number): void => {
  const base = Math.min(24, top * 0.35);
  const tiers: Tier[] = [
    { w: w - 6, d: d - 6, top: top * 0.78 },
    { w: w - 12, d: d - 12, top },
  ];
  p.building({ kind: 'condo', name, x, z, w, d, rot, h: base, style: { ...decoStyle(r, 'grid'), ornament: 'crown' }, interior: null, tiers, seed: Math.floor(r() * 1e9) });
};

// ------------------------------------------------------------- districts

const plan = (): Planner => {
  const p = new Planner();
  const seeded = (id: number): (() => number) => rng(0x5eed + id * 7919);

  // ---------------------------------------------------- column 0 (west)
  {
    const b = blockAt(0, 0);
    housesBlock(p, b, [1, 4], ['family', 'family', 'family'], seeded(b.id));
  }
  {
    const b = blockAt(0, 1);
    housesBlock(p, b, [2, 3], ['family', 'family', 'family'], seeded(b.id));
  }
  {
    const b = blockAt(0, 2);
    housesBlock(p, b, [], ['family', 'family', 'family'], seeded(b.id));
  }
  {
    // Fire station, apartments, a parking lot.
    const b = blockAt(0, 3);
    const r = seeded(b.id);
    const at = against(b, 'e', SIDEWALK + 25, 50, 40);
    p.building({ kind: 'civic', name: 'Fire Station 7', ...at, w: 50, d: 40, h: 16, style: { wall: 0xc94a3a, trim: 0xf6efe4, accent: 0xffd23f, roof: 0x6b6b6b, pattern: 'industrial', roofKind: 'flat', ornament: 'none' }, interior: 'fire', sign: 'FIRE STATION 7', seed: 7 });
    p.patch('tarmac', at.x + 20, at.z - 25, b.r.x1 - SIDEWALK, at.z + 25);
    p.gap(b, 'e', SIDEWALK, SIDEWALK + 50);
    const apt = against(b, 'e', D(b) - SIDEWALK - bayWidth(33) / 2, bayWidth(33), 30);
    p.building({ kind: 'condo', name: 'Mercy Apartments', ...apt, w: bayWidth(33), d: 30, h: 26, style: decoStyle(r, 'grid'), interior: null, seed: 11 });
    parkingLot(p, b, U(b, SIDEWALK + 4), V(b, SIDEWALK + 4), U(b, 66), V(b, D(b) - SIDEWALK - 4), r, 0.5, 'w');
    for (let i = 0; i < 4; i += 1) p.tree(U(b, 70), V(b, 16 + i * 20), r);
  }
  {
    // Townhouses facing Flamingo St, a garden behind.
    const b = blockAt(0, 4);
    const r = seeded(b.id);
    townhouseRow(p, b, 's', W(b) / 2, 4, r);
    p.patch('grass', U(b, SIDEWALK), V(b, SIDEWALK), U(b, W(b) - SIDEWALK), V(b, 56));
    p.patch('court', U(b, 14), V(b, 12), U(b, 54), V(b, 42));
    p.prop('hoop', U(b, 16), V(b, 27), H);
    p.prop('hoop', U(b, 52), V(b, 27), -H);
    p.patch('pool', U(b, 70), V(b, 16), U(b, 100), V(b, 36));
    for (let i = 0; i < 4; i += 1) p.prop('sun_lounger', U(b, 72 + i * 8), V(b, 42), P);
    for (let i = 0; i < 3; i += 1) p.prop('bench', U(b, 24 + i * 14), V(b, 50), P);
    for (let i = 0; i < 6; i += 1) p.palm(U(b, 10 + i * 19), V(b, 54), r);
  }
  {
    // Police HQ and the courthouse.
    const b = blockAt(0, 5);
    const r = seeded(b.id);
    const at = against(b, 'e', SIDEWALK + 30, 60, 44);
    p.building({ kind: 'civic', name: 'Palmhaven Police', ...at, w: 60, d: 44, h: 18, style: { wall: 0xe8eef6, trim: 0x23395d, accent: 0x4d8dff, roof: 0x8b96a8, pattern: 'grid', roofKind: 'flat', ornament: 'fins' }, interior: 'police', sign: 'POLICE', seed: 21 });
    p.patch('tarmac', U(b, 58), V(b, 70), U(b, W(b) - SIDEWALK), V(b, D(b) - SIDEWALK));
    for (let i = 0; i < 3; i += 1) p.park('police', U(b, 70 + i * 13), V(b, 82), P, 0x14181f);
    p.gap(b, 's', 60, 110);
    const court = against(b, 'w', 42, bayWidth(61), 30);
    p.building({ kind: 'deco', name: 'Palmhaven Courthouse', ...court, w: bayWidth(61), d: 30, h: 22, style: { ...decoStyle(r), wall: 0xf4efe2, ornament: 'crown' }, interior: null, seed: 22 });
    p.patch('plaza', U(b, 40), V(b, SIDEWALK), U(b, 64), V(b, D(b) - SIDEWALK));
    p.prop('statue', U(b, 52), V(b, 42));
    p.palm(U(b, 46), V(b, 20), r);
    p.palm(U(b, 58), V(b, 66), r);
  }
  {
    // Coastline Threads, the bank and offices.
    const b = blockAt(0, 6);
    const r = seeded(b.id);
    const shop = against(b, 'e', SIDEWALK + 18, 36, 28);
    p.building({ kind: 'shop', name: 'Coastline Threads', ...shop, w: 36, d: 28, h: 14, style: { wall: 0xffd6e4, trim: 0xff4f8b, accent: 0xffffff, roof: 0xe9e4da, pattern: 'shopfront', roofKind: 'flat', ornament: 'fins', awning: 0xff4f8b }, interior: 'clothing', shop: 'clothing', sign: 'Coastline Threads', seed: 31 });
    const bank = against(b, 'n', SIDEWALK + 16, 32, 26);
    p.building({ kind: 'civic', name: 'Bank of Palmhaven', ...bank, w: 32, d: 26, h: 16, style: { wall: 0xf3eedf, trim: 0x2f6f5e, accent: 0xd4af37, roof: 0xe9e4da, pattern: 'grid', roofKind: 'flat', ornament: 'crown' }, interior: 'bank', sign: 'BANK', seed: 32 });
    decoRow(p, b, 's', [bayWidth(48), bayWidth(48)], 30, [4, 6], r, 7.6);
    p.patch('plaza', U(b, 40), V(b, SIDEWALK), U(b, 82), V(b, 58));
    p.prop('atm', U(b, 44), V(b, 20), H);
    p.prop('bench', U(b, 60), V(b, 30));
    p.prop('vending', U(b, 78), V(b, 50), -H);
    p.palm(U(b, 50), V(b, 44), r);
    p.palm(U(b, 70), V(b, 16), r);
  }
  {
    // FreshMart and Casa Home round a parking lot.
    const b = blockAt(0, 7);
    const r = seeded(b.id);
    const grocery = against(b, 'e', SIDEWALK + 22, 44, 32);
    p.building({ kind: 'shop', name: 'FreshMart', ...grocery, w: 44, d: 32, h: 13, style: { wall: 0xe4f7ea, trim: 0x2fbf71, accent: 0xffd23f, roof: 0xe9e4da, pattern: 'shopfront', roofKind: 'flat', ornament: 'none', awning: 0x2fbf71 }, interior: 'grocery', shop: 'grocery', sign: 'FreshMart', seed: 41 });
    const home = against(b, 'n', SIDEWALK + 20, 40, 32);
    p.building({ kind: 'shop', name: 'Casa Home', ...home, w: 40, d: 32, h: 14, style: { wall: 0xf1e6fb, trim: 0x9b6bd8, accent: 0xffffff, roof: 0xe9e4da, pattern: 'shopfront', roofKind: 'flat', ornament: 'fins', awning: 0x9b6bd8 }, interior: 'furniture', shop: 'furniture', sign: 'Casa Home', seed: 42 });
    parkingLot(p, b, U(b, SIDEWALK + 2), V(b, 54), U(b, W(b) - SIDEWALK - 2), V(b, D(b) - SIDEWALK - 2), r, 0.6, 's');
    p.patch('plaza', U(b, 46), V(b, SIDEWALK), U(b, 80), V(b, 52));
    p.prop('vending', U(b, 50), V(b, 12), H);
    p.prop('bench', U(b, 62), V(b, 40), P);
    p.prop('trash_bin', U(b, 70), V(b, 40));
    p.palm(U(b, 56), V(b, 24), r);
    p.palm(U(b, 72), V(b, 30), r);
  }
  {
    // Palm Motors and its forecourt of cars for sale.
    const b = blockAt(0, 8);
    const r = seeded(b.id);
    const at = against(b, 'e', SIDEWALK + 24, 48, 34);
    p.building({ kind: 'shop', name: 'Palm Motors', ...at, w: 48, d: 34, h: 12, style: { wall: 0xeaf4ff, trim: 0x3aa0ff, accent: 0xff5d5d, roof: 0xdfe6ee, pattern: 'glass', roofKind: 'flat', ornament: 'fins' }, interior: 'dealer', shop: 'dealer', sign: 'PALM MOTORS', seed: 51 });
    p.patch('parking', U(b, SIDEWALK + 2), V(b, SIDEWALK + 2), U(b, 74), V(b, D(b) - SIDEWALK - 2));
    const forSale = ['sports', 'convertible', 'suv', 'luxury', 'pickup', 'sports', 'convertible', 'suv'];
    for (let i = 0; i < 8; i += 1) {
      const key = forSale[i]!;
      const col = i % 2;
      const row = Math.floor(i / 2);
      p.park(key, U(b, 22 + col * 30), V(b, 18 + row * 18), -H + (col ? 0.35 : -0.35), pick(r, CAR_PAINTS));
    }
    p.landmarks.push({ kind: 'flagpoles', x: U(b, 76), z: V(b, 12), y: CURB, rot: 0, scale: 1 });
    parkingLot(p, b, U(b, 78), V(b, 60), U(b, W(b) - SIDEWALK - 2), V(b, D(b) - SIDEWALK - 2), r, 0.4, 's');
  }
  {
    // The PalmPost depot and its yard.
    const b = blockAt(0, 9);
    const r = seeded(b.id);
    const at = against(b, 'e', SIDEWALK + 25, 50, 40);
    p.building({ kind: 'warehouse', name: 'PalmPost Depot', ...at, w: 50, d: 40, h: 14, style: { wall: 0xf3ead8, trim: 0xffb547, accent: 0x3a3a3a, roof: 0x9aa0a6, pattern: 'industrial', roofKind: 'flat', ornament: 'none' }, interior: 'depot', sign: 'PalmPost', seed: 61 });
    p.patch('tarmac', U(b, SIDEWALK + 2), V(b, SIDEWALK + 2), U(b, 70), V(b, D(b) - SIDEWALK - 2));
    p.patch('tarmac', U(b, 70), V(b, 58), U(b, W(b) - SIDEWALK), V(b, D(b) - SIDEWALK));
    for (let i = 0; i < 3; i += 1) p.park('van', U(b, 18 + i * 14), V(b, 74), P, 0xf7f3ea);
    for (let i = 0; i < 4; i += 1) p.prop('pallet', U(b, 16 + i * 12), V(b, 22));
    p.prop('crate_stack', U(b, 60), V(b, 40));
    p.gap(b, 's', 70, W(b) - SIDEWALK);
    p.gap(b, 'w', 20, 80);
    void r;
  }
  {
    const b = blockAt(0, 10);
    housesBlock(p, b, [], ['bungalow', 'bungalow', 'bungalow'], seeded(b.id));
  }

  // -------------------------------------------------- column 1 (middle)
  {
    const b = blockAt(1, 0);
    housesBlock(p, b, [0, 5], ['family', 'family', 'family'], seeded(b.id));
  }
  {
    // Palmhaven High and its sports field.
    const b = blockAt(1, 1);
    const r = seeded(b.id);
    const at = against(b, 'n', W(b) / 2, bayWidth(84), 30);
    p.building({ kind: 'school', name: 'Palmhaven High', ...at, w: bayWidth(84), d: 30, h: 15, style: { wall: 0xffe7c2, trim: 0x2b7bb9, accent: 0xff7a59, roof: 0xb0473f, pattern: 'grid', roofKind: 'flat', ornament: 'crown' }, interior: null, sign: 'PALMHAVEN HIGH', seed: 71 });
    p.patch('field', U(b, SIDEWALK + 4), V(b, 44), U(b, W(b) - SIDEWALK - 4), V(b, D(b) - SIDEWALK - 2));
    for (let i = 0; i < 6; i += 1) p.palm(U(b, 12 + i * 21), V(b, 40), r);
    p.prop('bench', U(b, 22), V(b, 41), 0);
    p.prop('bench', U(b, 106), V(b, 41), 0);
  }
  {
    const b = blockAt(1, 2);
    housesBlock(p, b, [1, 4], ['family', 'family', 'family'], seeded(b.id));
  }
  {
    // Palmhaven General Hospital.
    const b = blockAt(1, 3);
    const r = seeded(b.id);
    const at = against(b, 's', W(b) / 2, 76, 44);
    p.building({ kind: 'civic', name: 'Palmhaven General', ...at, w: 76, d: 44, h: 30, style: { wall: 0xf5fbfd, trim: 0xff5d6c, accent: 0x7cc6d6, roof: 0xdde5ea, pattern: 'grid', roofKind: 'flat', ornament: 'fins' }, interior: 'hospital', sign: 'HOSPITAL', seed: 81, tiers: [{ w: 60, d: 34, top: 42 }] });
    parkingLot(p, b, U(b, SIDEWALK + 2), V(b, SIDEWALK + 2), U(b, 84), V(b, 40), r, 0.5, 'n');
    p.patch('helipad', U(b, 90), V(b, SIDEWALK + 4), U(b, W(b) - SIDEWALK - 2), V(b, 40));
    p.park('ambulance', U(b, 30), V(b, D(b) - 3), H, 0xf4f4f4);
  }
  {
    // Central Park.
    const b = blockAt(1, 4);
    const r = seeded(b.id);
    const cx = U(b, W(b) / 2);
    const cz = V(b, D(b) / 2);
    p.patch('grass', b.r.x0 + SIDEWALK, b.r.z0 + SIDEWALK, b.r.x1 - SIDEWALK, b.r.z1 - SIDEWALK);
    p.patch('plaza', cx - 3, b.r.z0 + SIDEWALK, cx + 3, b.r.z1 - SIDEWALK);
    p.patch('plaza', b.r.x0 + SIDEWALK, cz - 3, b.r.x1 - SIDEWALK, cz + 3);
    p.patch('plaza', cx - 14, cz - 14, cx + 14, cz + 14);
    p.prop('fountain', cx, cz);
    for (const [dx, dz, rot] of [[-12, -18, P], [12, -18, P], [-12, 18, 0], [12, 18, 0], [-18, -12, -H], [-18, 12, -H], [18, -12, H], [18, 12, H]] as const) p.prop('bench', cx + dx, cz + dz, rot);
    p.patch('dirt', U(b, 76), V(b, 10), U(b, W(b) - 10), V(b, 40));
    p.prop('swings', U(b, 90), V(b, 18));
    p.prop('slide', U(b, 108), V(b, 26));
    p.prop('seesaw', U(b, 84), V(b, 32), H);
    p.patch('court', U(b, 12), V(b, 58), U(b, 52), V(b, 88));
    p.prop('hoop', U(b, 14), V(b, 73), H);
    p.prop('hoop', U(b, 50), V(b, 73), -H);
    p.prop('picnic_table', U(b, 86), V(b, 68));
    p.prop('picnic_table', U(b, 104), V(b, 80));
    p.prop('statue', U(b, 30), V(b, 26));
    for (let i = 0; i < 26; i += 1) {
      const x = U(b, 10 + r() * (W(b) - 20));
      const z = V(b, 10 + r() * (D(b) - 20));
      if (Math.abs(x - cx) < 18 && Math.abs(z - cz) < 18) continue;
      if (Math.abs(x - cx) < 5 || Math.abs(z - cz) < 5) continue;
      if (x > U(b, 72) && z < V(b, 44)) continue;
      if (x < U(b, 56) && z > V(b, 54)) continue;
      if (r() < 0.55) p.palm(x, z, r);
      else p.tree(x, z, r);
    }
  }
  {
    // City Hall and its plaza: where everyone arrives.
    const b = blockAt(1, 5);
    const r = seeded(b.id);
    const at = against(b, 'n', W(b) / 2, 56, 36, 2);
    p.building({ kind: 'civic', name: 'City Hall', ...at, rot: 0, w: 56, d: 36, h: 20, style: { wall: 0xfaf3e3, trim: 0x2bb3a3, accent: 0xffc53d, roof: 0xe9e4da, pattern: 'deco', roofKind: 'flat', ornament: 'crown' }, interior: 'cityhall', sign: 'CITY HALL', seed: 91, tiers: [{ w: 22, d: 18, top: 32 }] });
    const cx = U(b, W(b) / 2);
    p.patch('plaza', b.r.x0 + SIDEWALK, V(b, 46), b.r.x1 - SIDEWALK, b.r.z1 - SIDEWALK);
    p.prop('fountain', cx, V(b, 70));
    p.landmarks.push({ kind: 'flagpoles', x: cx, z: V(b, 50), y: CURB, rot: 0, scale: 1.3 });
    for (const dx of [-26, 26]) {
      p.prop('bench', cx + dx, V(b, 62), dx < 0 ? H : -H);
      p.prop('bench', cx + dx, V(b, 78), dx < 0 ? H : -H);
    }
    for (const dx of [-48, -36, 36, 48]) for (const dz of [54, 84]) p.palm(cx + dx, V(b, dz), r);
    p.prop('atm', cx + 40, V(b, 70), -H);
    p.prop('vending', cx - 40, V(b, 70), H);
    p.patch('grass', b.r.x0 + SIDEWALK, b.r.z0 + SIDEWALK, U(b, 34), V(b, 44));
    p.patch('grass', U(b, 94), b.r.z0 + SIDEWALK, b.r.x1 - SIDEWALK, V(b, 44));
  }
  {
    // Palmhaven Tower and Palm Burger.
    const b = blockAt(1, 6);
    const r = seeded(b.id);
    p.patch('plaza', b.r.x0 + SIDEWALK, b.r.z0 + SIDEWALK, U(b, 78), b.r.z1 - SIDEWALK);
    p.building({
      kind: 'tower', name: 'Palmhaven Tower', x: U(b, 40), z: V(b, 46), w: 42, d: 42, rot: 0, h: 34,
      style: { wall: 0xffb3c6, trim: 0xffffff, accent: 0x5ec8f2, roof: 0xffffff, pattern: 'glass', roofKind: 'flat', ornament: 'crown' },
      interior: null, sign: 'PALMHAVEN TOWER', seed: 101,
      tiers: [{ w: 34, d: 34, top: 96 }, { w: 26, d: 26, top: 140 }, { w: 14, d: 14, top: 152 }],
    });
    const burger = against(b, 'e', SIDEWALK + 18, 36, 26);
    p.building({ kind: 'shop', name: 'Palm Burger', ...burger, w: 36, d: 26, h: 12, style: { wall: 0xfff1e0, trim: 0xff4757, accent: 0xffd23f, roof: 0xe9e4da, pattern: 'shopfront', roofKind: 'flat', ornament: 'fins', awning: 0xff4757 }, interior: 'burger', shop: 'burger', sign: 'Palm Burger', seed: 102 });
    parkingLot(p, b, U(b, 82), V(b, 50), U(b, W(b) - SIDEWALK - 2), V(b, D(b) - SIDEWALK - 2), r, 0.6, 's');
    for (const [u, v] of [[12, 12], [68, 12], [12, 80], [68, 80]] as const) p.palm(U(b, u), V(b, v), r);
    p.prop('bench', U(b, 40), V(b, 80), 0);
  }
  {
    // Lincoln Plaza: a strip of little shops and a parking lot.
    const b = blockAt(1, 7);
    const r = seeded(b.id);
    const widths = [bayWidth(21), bayWidth(21), bayWidth(21), bayWidth(21), bayWidth(21)];
    let cursor = (W(b) - widths.reduce((a, w) => a + w, 0) - 4 * 1.2) / 2;
    for (const w of widths) {
      const at = against(b, 'n', cursor + w / 2, w, 22);
      const name = p.storeName();
      p.building({ kind: 'storefront', name, ...at, w, d: 22, h: 10 + Math.floor(r() * 3), style: { ...decoStyle(r, 'shopfront'), awning: pick(r, DECO_TRIM) }, interior: null, sign: name, seed: Math.floor(r() * 1e9) });
      cursor += w + 1.2;
    }
    parkingLot(p, b, U(b, SIDEWALK + 2), V(b, 36), U(b, W(b) - SIDEWALK - 2), V(b, D(b) - SIDEWALK - 2), r, 0.6, 's');
    p.prop('bus_stop', U(b, 30), V(b, D(b) - 2.6), 0);
  }
  {
    // Sun Fuel and the taxi rank.
    const b = blockAt(1, 8);
    const r = seeded(b.id);
    p.patch('tarmac', b.r.x0 + SIDEWALK, b.r.z0 + SIDEWALK, b.r.x1 - SIDEWALK, b.r.z1 - SIDEWALK);
    const mart = against(b, 'e', 41, 22, 18);
    p.building({ kind: 'shop', name: 'Sun Fuel Mart', ...mart, w: 22, d: 18, h: 10, style: { wall: 0xfff6d6, trim: 0xff8a3d, accent: 0xffd23f, roof: 0xe9e4da, pattern: 'shopfront', roofKind: 'flat', ornament: 'none', awning: 0xff8a3d }, interior: 'gasmart', shop: 'gas', sign: 'Sun Fuel', seed: 111 });
    const cx = U(b, 62);
    const cz = V(b, 44);
    p.landmarks.push({ kind: 'gas_canopy', x: cx, z: cz, y: CURB, rot: 0, scale: 1 });
    for (const dx of [-15, 0, 15]) {
      p.prop('gas_pump', cx + dx, cz - 4, 0);
      p.prop('gas_pump', cx + dx, cz + 4, P);
    }
    for (const sx of [-22, 22]) for (const sz of [-10, 10]) p.solids.push({ minX: cx + sx - 0.7, maxX: cx + sx + 0.7, minY: CURB, maxY: CURB + 9, minZ: cz + sz - 0.7, maxZ: cz + sz + 0.7 });
    const kiosk = against(b, 's', 18, 12, 10);
    p.building({ kind: 'kiosk', name: 'Taxi Dispatch', ...kiosk, w: 12, d: 10, h: 7, style: { wall: 0xffd23f, trim: 0x222222, accent: 0xffffff, roof: 0x222222, pattern: 'shopfront', roofKind: 'flat', ornament: 'none' }, interior: null, sign: 'TAXI', seed: 112 });
    p.prop('locker', U(b, 28), V(b, D(b) - SIDEWALK - 2), 0);
    for (let i = 0; i < 3; i += 1) p.park('taxi', U(b, 40 + i * 12), V(b, 80), P, 0xffc61a);
    p.gap(b, 'w', 20, 70);
    p.gap(b, 'n', 30, 100);
    p.gap(b, 's', 30, 100);
    void r;
  }
  {
    // Townhouses and Bayview Apartments.
    const b = blockAt(1, 9);
    const r = seeded(b.id);
    townhouseRow(p, b, 'n', W(b) / 2, 4, r);
    const apt = against(b, 's', W(b) / 2, bayWidth(100), 28);
    p.building({ kind: 'condo', name: 'Bayview Apartments', ...apt, w: bayWidth(100), d: 28, h: 23, style: decoStyle(r, 'grid'), interior: null, seed: 121 });
    p.patch('garden', b.r.x0 + SIDEWALK, V(b, 40), b.r.x1 - SIDEWALK, V(b, 56));
    for (let i = 0; i < 5; i += 1) p.palm(U(b, 16 + i * 24), V(b, 48), r);
  }
  {
    const b = blockAt(1, 10);
    housesBlock(p, b, [], ['bungalow', 'bungalow', 'bungalow'], seeded(b.id));
  }

  // --------------------------------------------- column 2 (Ocean Drive)
  {
    // Seaside Condos.
    const b = blockAt(2, 0);
    const r = seeded(b.id);
    const w = bayWidth(36);
    condoTower(p, 'Seaside North', U(b, W(b) - SIDEWALK - 15), V(b, SIDEWALK + w / 2 + 2), w, 30, H, 62, r);
    condoTower(p, 'Seaside South', U(b, W(b) - SIDEWALK - 15), V(b, D(b) - SIDEWALK - w / 2 - 2), w, 30, H, 50, r);
    p.patch('deck', U(b, 60), V(b, 30), U(b, 104), V(b, 68));
    p.patch('pool', U(b, 68), V(b, 38), U(b, 96), V(b, 60));
    for (let i = 0; i < 4; i += 1) p.prop('sun_lounger', U(b, 64), V(b, 38 + i * 6), H);
    parkingLot(p, b, U(b, SIDEWALK + 2), V(b, SIDEWALK + 2), U(b, 56), V(b, D(b) - SIDEWALK - 2), r, 0.5, 'w');
  }
  {
    // Beach bungalows on the north shore.
    const b = blockAt(2, 1);
    housesBlock(p, b, [0, 2, 3, 5], ['bungalow', 'bungalow', 'bungalow'], seeded(b.id), ['e', 'w']);
  }
  {
    // Townhouses on Ocean Drive, the Coral Arms behind.
    const b = blockAt(2, 2);
    const r = seeded(b.id);
    townhouseRow(p, b, 'e', D(b) / 2, 4, r);
    const arms = against(b, 'w', D(b) / 2, bayWidth(80), 28);
    p.building({ kind: 'condo', name: 'Coral Arms', ...arms, w: bayWidth(80), d: 28, h: 22, style: decoStyle(r, 'deco'), interior: null, seed: 131 });
    p.patch('garden', U(b, 40), V(b, SIDEWALK), U(b, 88), V(b, D(b) - SIDEWALK));
    for (let i = 0; i < 4; i += 1) p.tree(U(b, 64), V(b, 14 + i * 22), r);
  }
  hotelBlock(p, blockAt(2, 3), seeded(blockAt(2, 3).id), 'parking');
  hotelBlock(p, blockAt(2, 4), seeded(blockAt(2, 4).id), 'pool');
  {
    // Sunset Cafe on the corner, hotels beside it.
    const b = blockAt(2, 5);
    const r = seeded(b.id);
    const cafe = against(b, 'e', SIDEWALK + 14, 28, 24);
    p.building({ kind: 'shop', name: 'Sunset Cafe', ...cafe, w: 28, d: 24, h: 12, style: { wall: 0xffe9cf, trim: 0xff9f43, accent: 0x2bb3a3, roof: 0xe9e4da, pattern: 'shopfront', roofKind: 'flat', ornament: 'fins', awning: 0xff9f43 }, interior: 'cafe', shop: 'cafe', sign: 'Sunset Cafe', seed: 141 });
    for (const dz of [-7, 7]) p.prop('cafe_table', cafe.x + 14 + 2.6, cafe.z + dz + 18);
    const widths = [bayWidth(25), bayWidth(25)];
    let cursor = SIDEWALK + 28 + 4;
    for (const w of widths) {
      const at = against(b, 'e', cursor + w / 2, w, 32);
      p.building({ kind: 'deco', name: p.hotelName(), ...at, w, d: 32, h: (5 + Math.floor(r() * 3)) * 4.5 + 1.6, style: decoStyle(r), interior: null, seed: Math.floor(r() * 1e9) });
      cursor += w + 3.2;
    }
    decoRow(p, b, 'w', [bayWidth(37), bayWidth(41)], 28, [3, 5], r, 7.6);
    parkingLot(p, b, U(b, SIDEWALK + 31), V(b, SIDEWALK + 2), U(b, W(b) - SIDEWALK - 35), V(b, D(b) - SIDEWALK - 2), r, 0.5, 'n');
  }
  hotelBlock(p, blockAt(2, 6), seeded(blockAt(2, 6).id), 'pool');
  hotelBlock(p, blockAt(2, 7), seeded(blockAt(2, 7).id), 'parking');
  hotelBlock(p, blockAt(2, 8), seeded(blockAt(2, 8).id), 'pool');
  {
    // Marlin Suites.
    const b = blockAt(2, 9);
    const r = seeded(b.id);
    condoTower(p, 'Marlin Suites', U(b, W(b) - SIDEWALK - 17), V(b, D(b) / 2), bayWidth(60), 34, H, 44, r);
    parkingLot(p, b, U(b, SIDEWALK + 2), V(b, SIDEWALK + 2), U(b, 70), V(b, D(b) - SIDEWALK - 2), r, 0.55, 'w');
  }
  {
    // South Beach Motel.
    const b = blockAt(2, 10);
    const r = seeded(b.id);
    const at = against(b, 'e', D(b) / 2, bayWidth(61), 18);
    p.building({ kind: 'motel', name: 'South Beach Motel', ...at, w: bayWidth(61), d: 18, h: 10.6, style: { ...decoStyle(r, 'deco'), wall: 0xfff0ad, trim: 0x38c1d6 }, interior: null, sign: 'MOTEL', seed: 151 });
    p.patch('pool', U(b, 70), V(b, 20), U(b, 94), V(b, 56));
    for (let i = 0; i < 4; i += 1) p.prop('sun_lounger', U(b, 66), V(b, 22 + i * 8), H);
    parkingLot(p, b, U(b, SIDEWALK + 2), V(b, SIDEWALK + 2), U(b, 58), V(b, D(b) - SIDEWALK - 2), r, 0.5, 'w');
  }

  // ----------------------------------------------------- the bayfront
  {
    // Waterfront villas, each with a pool and a private dock.
    const b = blockAt(-1, 0);
    const r = seeded(b.id);
    const def = HOUSE_STYLES.villa;
    const lots = 4;
    const lotLength = D(b) / lots;
    for (let i = 0; i < lots; i += 1) {
      const along = lotLength * (i + 0.5);
      const at = against(b, 'e', along, def.w, def.d, 8);
      const houseIndex = p.houses.length;
      const address = `${(i + 1) * 10} Bayshore Drive`;
      const spec = p.building({
        kind: 'house', name: address, ...at, w: def.w, d: def.d, h: def.h,
        style: { wall: 0xffffff, trim: 0x2bb3a3, accent: 0xffc53d, roof: 0xe9e4da, pattern: 'glass', roofKind: 'flat', ornament: 'none' },
        interior: 'home', house: houseIndex, seed: Math.floor(r() * 1e9),
      });
      p.houses.push({ id: houseIndex, style: 'villa', building: spec.id, address, x: at.x, z: at.z, rot: at.rot, base: CURB });
      const z = V(b, along);
      p.patch('grass', b.r.x0 + 1, z - lotLength / 2 + 1, b.r.x1 - SIDEWALK, z + lotLength / 2 - 1);
      p.patch('driveway', at.x + def.d / 2, z - 3, b.r.x1 - SIDEWALK, z + 3);
      p.patch('deck', b.r.x0 + 3, z - 14, at.x - def.d / 2 - 2, z + 14);
      p.patch('pool', b.r.x0 + 8, z - 9, at.x - def.d / 2 - 6, z + 9);
      p.prop('sun_lounger', b.r.x0 + 6, z - 12, H);
      p.prop('sun_lounger', b.r.x0 + 6, z + 12, H);
      p.prop('hot_tub', at.x - def.d / 2 - 6, z + 19);
      p.docks.push({ x0: ISLAND.x0 - 38, z0: z - 3, x1: ISLAND.x0 + 1, z1: z + 3, top: 0.6, kind: 'wood' });
      if (i % 2 === 0) p.park('speedboat', ISLAND.x0 - 26, z + 9, -H, pick(r, [0xffffff, 0x1e5fa8, 0xd94a4a]), true);
      for (const dz of [-lotLength / 2 + 3, lotLength / 2 - 3]) p.prop('hedge', at.x, z + dz, 0);
      p.palm(at.x + def.d / 2 + 4, z - 12, r);
      p.palm(at.x + def.d / 2 + 4, z + 12, r);
      p.palm(b.r.x0 + 4, z - 20, r);
    }
  }
  {
    // Biscay Bay Park, the Bay Club and the public boat dock.
    const b = blockAt(-1, 1);
    const r = seeded(b.id);
    p.patch('grass', b.r.x0 + 1, b.r.z0 + 1, b.r.x1 - SIDEWALK, b.r.z1 - 1);
    p.patch('plaza', b.r.x0 + 8, b.r.z0 + 2, b.r.x0 + 14, b.r.z1 - 2);
    const club = against(b, 'e', D(b) / 2 + 30, bayWidth(41), 22);
    p.building({ kind: 'deco', name: 'The Bay Club', ...club, w: bayWidth(41), d: 22, h: 12, style: { ...decoStyle(r), wall: 0xffffff, trim: 0x2bb3a3, ornament: 'corner' }, interior: null, sign: 'THE BAY CLUB', seed: 161 });
    const dz = V(b, 150);
    p.docks.push({ x0: ISLAND.x0 - 40, z0: dz - 4, x1: ISLAND.x0 + 1, z1: dz + 4, top: 0.6, kind: 'wood' });
    p.prop('boat_kiosk', b.r.x0 + 20, dz, -H);
    p.patch('plaza', b.r.x0 + 1, dz - 12, b.r.x0 + 30, dz + 12);
    for (let i = 0; i < 18; i += 1) {
      const z = V(b, 20 + i * 31);
      if (Math.abs(z - dz) < 16 || Math.abs(z - club.z) < 26) continue;
      if (i % 3 === 0) p.prop('bench', b.r.x0 + 18, z, -H);
      else if (i % 3 === 1) p.prop('picnic_table', b.r.x0 + 40, z);
      p.palm(b.r.x0 + 4, z + 8, r);
      if (r() < 0.6) p.tree(b.r.x0 + 58, z - 6, r);
    }
  }
  {
    // The marina.
    const b = blockAt(-1, 2);
    const r = seeded(b.id);
    p.patch('plaza', b.r.x0 + 1, b.r.z0 + 1, b.r.x1 - SIDEWALK, b.r.z1 - 1);
    const office = against(b, 'e', 30, bayWidth(29), 16);
    p.building({ kind: 'deco', name: 'Palmhaven Marina', ...office, w: bayWidth(29), d: 16, h: 9.6, style: { ...decoStyle(r), wall: 0xeaf6ff, trim: 0x1e5fa8, ornament: 'fins' }, interior: null, sign: 'MARINA', seed: 171 });
    parkingLot(p, b, U(b, 34), V(b, 60), U(b, W(b) - SIDEWALK - 2), V(b, 140), r, 0.5, 'e');
    p.prop('boat_kiosk', b.r.x0 + 8, V(b, 70), -H);
    for (const z of [V(b, 90), V(b, 140), V(b, 190)]) {
      p.docks.push({ x0: ISLAND.x0 - 92, z0: z - 3, x1: ISLAND.x0 + 1, z1: z + 3, top: 0.6, kind: 'wood' });
      for (let k = 1; k <= 4; k += 1) {
        const x = ISLAND.x0 - k * 20;
        p.docks.push({ x0: x - 1.2, z0: z + 3, x1: x + 1.2, z1: z + 13, top: 0.6, kind: 'wood' });
        p.prop('dock_post', x, z - 3.6, 0, 0.6);
        if (r() < 0.6) p.park(pick(r, ['speedboat', 'jetski', 'speedboat']), x + 10, z + 10, pick(r, [H, -H]), pick(r, [0xffffff, 0x1e5fa8, 0xd94a4a, 0xffd23f]), true);
      }
    }
    for (const z of [V(b, 90), V(b, 190)]) p.park('yacht', ISLAND.x0 - 48, z - 10, H, pick(r, [0xf6f6f2, 0x1b2a41]), true);
    p.prop('gas_pump', ISLAND.x0 - 88, V(b, 90) - 1.5, P, 0.6);
    for (let i = 0; i < 5; i += 1) p.palm(b.r.x0 + 26, V(b, 16 + i * 40), r);
    p.prop('bench', b.r.x0 + 4, V(b, 112), -H);
    p.prop('bench', b.r.x0 + 4, V(b, 164), -H);
  }

  // ------------------------------------------------ promenade & beach
  {
    const b = blockAt(3, 0);
    const r = seeded(b.id);
    p.patch('plaza', b.r.x0, b.r.z0, b.r.x1, b.r.z1);
    for (let z = b.r.z0 + 12; z < b.r.z1 - 8; z += 20) p.palm(b.r.x0 + 10.5, z, r);
    for (let z = b.r.z0 + 30; z < b.r.z1 - 8; z += 60) {
      p.prop('bench', b.r.x1 - 2.6, z, H);
      p.prop('trash_bin', b.r.x1 - 2.2, z + 5);
    }
  }
  {
    const r = rng(0xbeac4);
    // Lifeguard towers, umbrellas, towels, volleyball.
    for (const z of [-620, -380, -130, 130, 420, 560]) p.prop('lifeguard_tower', 336, z, H, 0);
    for (const z of [-250, 10]) p.prop('volleyball_net', 318, z, H, 0);
    for (let z = -780; z < 600; z += 34) {
      if (Math.abs(z - 280) < 22) continue;
      if (r() < 0.75) {
        const x = 292 + r() * 64;
        p.prop('beach_umbrella', x, z, 0, 0);
        p.prop('beach_towel', x - 2.2, z + 1, r() * 0.6 - 0.3, 0);
        if (r() < 0.6) p.prop('beach_towel', x + 2.4, z + 1.4, r() * 0.6 - 0.3, 0);
      }
      if (r() < 0.45) p.prop('sun_lounger', 284 + r() * 10, z + 12, H + (r() - 0.5) * 0.4, 0);
      if (r() < 0.7) p.palm(272 + r() * 10, z + r() * 20, r, 0);
    }
    // The pier: a ramp up from the sand, a deck out over the sea, the wheel at its end.
    p.ramps.push({ minX: 300, maxX: 330, minZ: 271, maxZ: 289, axis: 'x', y0: 0, y1: 2.4 });
    p.docks.push({ x0: 330, z0: 271, x1: 524, z1: 289, top: 2.4, kind: 'wood' });
    p.docks.push({ x0: 480, z0: 255, x1: 524, z1: 305, top: 2.4, kind: 'wood' });
    for (const z of [271, 289]) p.solids.push({ minX: 330, maxX: 480, minY: 2.4, maxY: 3.6, minZ: z - 0.25, maxZ: z + 0.25 });
    p.landmarks.push({ kind: 'ferris', x: 508, z: 280, y: 2.4, rot: H, scale: 1 });
    p.solids.push({ minX: 503, maxX: 513, minY: 2.4, maxY: 8, minZ: 274, maxZ: 286 });
    for (let x = 350; x < 480; x += 30) {
      p.prop('bench', x, 286.6, P, 2.4);
      p.lamps.push({ x: x + 15, z: 271.8, y: 2.4, rot: 0 });
    }
    p.prop('vending', 486, 260, 0, 2.4);
    p.prop('bench', 490, 300, P, 2.4);
  }

  // -------------------------------------------------------------- the tips
  {
    // North Point Park and the lighthouse.
    const b = blockAt(4, 0);
    const r = seeded(b.id);
    p.patch('grass', b.r.x0, b.r.z0, b.r.x1, b.r.z1);
    p.building({ kind: 'lighthouse', name: 'North Point Lighthouse', x: 40, z: -826, w: 12, d: 12, rot: 0, h: 34, style: { wall: 0xffffff, trim: 0xe53e3e, accent: 0x2b2b2b, roof: 0xe53e3e, pattern: 'plain', roofKind: 'flat', ornament: 'none' }, interior: null, seed: 181, base: 0 });
    p.landmarks.push({ kind: 'lighthouse_lamp', x: 40, z: -826, y: 34, rot: 0 });
    for (let i = 0; i < 9; i += 1) {
      p.prop(i % 2 ? 'bench' : 'picnic_table', -160 + i * 44, -776, i % 2 ? P : 0);
      p.palm(-150 + i * 44, -790, r);
    }
  }
  {
    // South Pointe Park and the big PALMHAVEN letters.
    const b = blockAt(4, 1);
    const r = seeded(b.id);
    p.patch('grass', b.r.x0, b.r.z0, b.r.x1, b.r.z1);
    p.landmarks.push({ kind: 'palm_sign', x: 30, z: 596, y: CURB, rot: P, text: 'PALMHAVEN' });
    p.solids.push({ minX: -14, maxX: 74, minY: CURB, maxY: CURB + 8, minZ: 593, maxZ: 599 });
    for (let i = 0; i < 10; i += 1) {
      p.palm(-180 + i * 44, 608, r);
      if (i % 3 === 0) p.prop('bench', -170 + i * 44, 585, 0);
    }
  }

  // ------------------------------------------------------- the causeways
  for (const cz of CAUSEWAY_Z) {
    p.ramps.push({ minX: BRIDGE.rampW0, maxX: BRIDGE.deck0, minZ: cz - BRIDGE.halfWidth, maxZ: cz + BRIDGE.halfWidth, axis: 'x', y0: 0, y1: BRIDGE.deckTop });
    p.ramps.push({ minX: BRIDGE.deck1, maxX: BRIDGE.rampE1, minZ: cz - BRIDGE.halfWidth, maxZ: cz + BRIDGE.halfWidth, axis: 'x', y0: BRIDGE.deckTop, y1: 0 });
    p.docks.push({ x0: BRIDGE.deck0, z0: cz - BRIDGE.halfWidth, x1: BRIDGE.deck1, z1: cz + BRIDGE.halfWidth, top: BRIDGE.deckTop, kind: 'concrete' });
    for (const side of [-1, 1]) {
      const z = cz + side * (BRIDGE.halfWidth - 0.4);
      p.solids.push({ minX: BRIDGE.rampW0, maxX: BRIDGE.rampE1, minY: 0, maxY: BRIDGE.deckTop + 1.4, minZ: z - 0.4, maxZ: z + 0.4 });
    }
    for (let x = MAINLAND_SHORE + 30; x < ISLAND.x0 - 10; x += 40) {
      if (x > BRIDGE.rampW0 - 4 && x < BRIDGE.rampE1 + 4) continue;
      p.lamps.push({ x, z: cz - 14, y: 0, rot: 0 });
      p.lamps.push({ x: x + 20, z: cz + 14, y: 0, rot: P });
    }
  }
  p.landmarks.push({ kind: 'welcome_sign', x: AIRPORT_BLVD_X + 40, z: CAUSEWAY_Z[0] - 30, y: 0, rot: H, text: 'Welcome to Palmhaven' });

  // ---------------------------------------------------------- the airport
  {
    const r = rng(0xa1590);
    const a = AIRPORT;
    p.patch('runway', a.runway.x0, a.runway.z0, a.runway.x1, a.runway.z1, 0.04);
    p.patch('tarmac', a.taxiway.x0, a.taxiway.z0, a.taxiway.x1, a.taxiway.z1, 0.03);
    p.patch('tarmac', a.taxiway.x1 - 16, a.taxiway.z0, a.taxiway.x1, a.runway.z0, 0.03);
    p.patch('tarmac', a.taxiway.x0, a.taxiway.z0, a.taxiway.x0 + 16, a.runway.z0, 0.03);
    p.patch('tarmac', a.apron.x0, a.apron.z0, a.apron.x1, a.apron.z1, 0.03);
    p.patch('tarmac', -1215, -82, a.apron.x0, -20, 0.03);
    p.patch('helipad', a.helipad.x - a.helipad.r, a.helipad.z - a.helipad.r, a.helipad.x + a.helipad.r, a.helipad.z + a.helipad.r, 0.05);
    p.building({ kind: 'terminal', name: 'Palmhaven International', x: -960, z: -206, w: 120, d: 56, rot: 0, h: 16, style: { wall: 0xf4f8fb, trim: 0x2b6cb0, accent: 0x5ec8f2, roof: 0xdfe6ee, pattern: 'glass', roofKind: 'flat', ornament: 'fins' }, interior: 'terminal', sign: 'PALMHAVEN INTERNATIONAL', seed: 191, base: 0 });
    for (const hx of [-1140, -1190]) {
      p.building({ kind: 'hangar', name: 'Hangar', x: hx, z: -100, w: 44, d: 36, rot: 0, h: 16, style: { wall: 0xd7dee6, trim: 0x2b6cb0, accent: 0xffd23f, roof: 0x9aa7b4, pattern: 'industrial', roofKind: 'flat', ornament: 'none' }, interior: 'hangar', sign: hx === -1140 ? 'HANGAR 1' : 'HANGAR 2', seed: 192 + hx, base: 0 });
    }
    p.building({ kind: 'controltower', name: 'Control Tower', x: -1100, z: -200, w: 10, d: 10, rot: 0, h: 40, style: { wall: 0xeef2f6, trim: 0x2b6cb0, accent: 0x5ec8f2, roof: 0xdfe6ee, pattern: 'plain', roofKind: 'flat', ornament: 'none' }, interior: null, seed: 196, base: 0 });
    p.patch('parking', -880, -200, -760, -168, 0.03);
    for (let i = 0; i < 16; i += 1) if (r() < 0.6) p.park(pick(r, CARS), -872 + i * 7, -186, i % 2 ? 0 : P, pick(r, CAR_PAINTS));
    for (let i = 0; i < 2; i += 1) {
      const z = 200 + i * 70;
      p.building({ kind: 'warehouse', name: 'Warehouse', x: AIRPORT_BLVD_X - ROAD_HALF - 6 - 15, z, w: 40, d: 30, rot: H, h: 13, style: { wall: pick(r, [0xe6dccb, 0xd7e3ea]), trim: 0x8a6b4a, accent: 0xffb547, roof: 0x9aa0a6, pattern: 'industrial', roofKind: 'flat', ornament: 'none' }, interior: null, seed: 197 + i, base: 0 });
    }
    // Scatter trees over the mainland, clear of everything built.
    for (let i = 0; i < 260; i += 1) {
      const x = -1450 + r() * (MAINLAND_SHORE - 20 + 1450);
      const z = -860 + r() * 1720;
      if (x > -1320 && x < -740 && z > -260 && z < 110) continue;
      if (Math.abs(x - AIRPORT_BLVD_X) < 22) continue;
      if (CAUSEWAY_Z.some((cz) => Math.abs(z - cz) < 26)) continue;
      if (x > AIRPORT_BLVD_X - 60 && x < AIRPORT_BLVD_X - 10 && z > 170 && z < 310) continue;
      if (!isLand(x, z)) continue;
      if (r() < 0.45) p.palm(x, z, r, 0);
      else p.tree(x, z, r, 0, r() < 0.7 ? 'round' : 'cone');
    }
  }

  streetscape(p);
  signals(p);
  return p;
};

// ------------------------------------------------------------ streetscape

/** Palms, lamps, hydrants and bins along every sidewalk of the grid. */
const streetscape = (p: Planner): void => {
  const r = rng(0x57ee7);
  for (const b of BLOCKS) {
    if (b.col < 0 || b.col > 2) continue;
    const gaps = p.gaps.get(b.id) ?? [];
    const clear = (side: Side, at: number): boolean => !gaps.some((g) => g.side === side && at > g.from - 3 && at < g.to + 3);
    for (const side of ['n', 's', 'e', 'w'] as const) {
      const length = side === 'n' || side === 's' ? W(b) : D(b);
      let k = 0;
      for (let a = 12; a < length - 10; a += 22, k += 1) {
        if (!clear(side, a)) continue;
        const inset = k % 2 === 0 ? 2.4 : 1.1;
        const pos = sidewalkPoint(b, side, a, inset);
        if (k % 2 === 0) p.palm(pos.x, pos.z, r, CURB, 11 + r() * 6);
        else p.lamps.push({ x: pos.x, z: pos.z, y: CURB, rot: ROT[side] + P });
        if (k % 5 === 3) {
          const hydrant = sidewalkPoint(b, side, a + 6, 1.2);
          p.prop('hydrant', hydrant.x, hydrant.z, ROT[side]);
        }
        if (k % 7 === 5) {
          const bin = sidewalkPoint(b, side, a + 5, 1.4);
          p.prop('trash_bin', bin.x, bin.z, ROT[side]);
        }
      }
    }
  }
};

/** A point on a block's sidewalk: `along` from the side's start, `inset` in from the curb. */
const sidewalkPoint = (b: Block, side: Side, along: number, inset: number): { x: number; z: number } => {
  switch (side) {
    case 'n':
      return { x: U(b, along), z: b.r.z0 + inset };
    case 's':
      return { x: U(b, along), z: b.r.z1 - inset };
    case 'e':
      return { x: b.r.x1 - inset, z: V(b, along) };
    case 'w':
      return { x: b.r.x0 + inset, z: V(b, along) };
  }
};

/** Two signal gantries per grid intersection: one over the avenue, one over the street. */
const signals = (p: Planner): void => {
  for (const i of INTERSECTIONS) {
    if (i.x === AIRPORT_BLVD_X) continue;
    const off = ROAD_HALF + 1.6;
    p.signals.push({ x: i.x + off, z: i.z + off, rot: -H, axis: 'ns', intersection: i.id });
    p.signals.push({ x: i.x - off, z: i.z - off, rot: 0, axis: 'ew', intersection: i.id });
  }
};

let cached: CityPlan | null = null;

/** The plan, built once. */
export const cityPlan = (): CityPlan => {
  cached ??= plan();
  return cached;
};

/** For debugging and tests: the beach line, re-exported so callers need not import layout. */
export const BEACH_LINE = BEACH_X0;
export type { BuildingKind, InteriorKind, ShopId };
