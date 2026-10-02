import type { Aabb } from '../types/math.js';
import type { JobId } from '../config/jobs.js';
import type { ShopId } from '../config/shops.js';
import { vehicleByKey } from '../config/vehicles.js';
import { footprintOf, type BuildingSpec, type Ramp } from './buildings.js';
import { HOUSE_STYLES, type HousePlot } from './houses.js';
import { INTERIOR_HEIGHT, WALL, doorsOf, interiorLayout, type InteriorKind, type LocalProp } from './interiors.js';
import { AVENUES, BLOCKS, CURB, ROAD_HALF, SIDEWALK, STREETS, WATER_Y, type Block } from './layout.js';
import { cityPlan, type CityPlan } from './plan.js';
import { propByKey, propFootprint, rotateXZ, type InteractKind, type PropDef, type SeatPose } from './props.js';

/**
 * THE CITY, ASSEMBLED: the plan turned into what the simulation and the
 * interaction code need - collision boxes, ramps, seats, interaction points,
 * doors, named places - built once and shared by the server and every client.
 */

export interface Seat {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rot: number;
  readonly pose: SeatPose;
}

export interface Interactable {
  readonly id: number;
  readonly kind: InteractKind;
  readonly prop: string;
  readonly label: string;
  /** Where a customer stands. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Where staff stand (behind a counter, at a station). */
  readonly bx: number;
  readonly bz: number;
  readonly building: number;
  readonly shop?: ShopId;
  readonly job?: JobId;
}

export interface Door {
  readonly id: number;
  readonly building: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The way the door faces out of the building. */
  readonly rot: number;
  readonly width: number;
  readonly height: number;
  readonly house?: number;
}

export interface DisplayVehicle {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rot: number;
}

export type PlaceIcon = 'home' | 'police' | 'hospital' | 'fire' | 'shop' | 'food' | 'car' | 'gas' | 'plane' | 'boat' | 'job' | 'bank' | 'park' | 'beach' | 'landmark' | 'taxi' | 'box';

export interface Place {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Facing when placed there (toward the building). */
  readonly yaw: number;
  readonly icon: PlaceIcon;
  /** Shown on the phone's GPS list. */
  readonly listed: boolean;
}

export interface CityData {
  readonly plan: CityPlan;
  readonly solids: readonly Aabb[];
  readonly ramps: readonly Ramp[];
  readonly seats: readonly Seat[];
  readonly interactables: readonly Interactable[];
  readonly doors: readonly Door[];
  readonly displays: readonly DisplayVehicle[];
  readonly places: readonly Place[];
  readonly placeById: ReadonlyMap<string, Place>;
  /** Jail cells (world points inside the police station). */
  readonly cells: readonly { x: number; y: number; z: number }[];
  /** Where an NPC customer stands at each staffed shop. */
  readonly customerSpots: Readonly<Partial<Record<ShopId, { x: number; y: number; z: number; rot: number }>>>;
  /** Doorsteps for parcels, and street corners for taxi fares and dispatch calls. */
  readonly doorsteps: readonly { x: number; y: number; z: number; label: string }[];
  readonly curbside: readonly { x: number; y: number; z: number; label: string }[];
}

const H = Math.PI / 2;

/** Local -> world for a building. */
export const toWorldOf = (b: { x: number; z: number; rot: number }, lx: number, lz: number): { x: number; z: number } => {
  const r = rotateXZ(lx, lz, b.rot);
  return { x: b.x + r.x, z: b.z + r.z };
};

/** World -> local for a building. */
export const toLocalOf = (b: { x: number; z: number; rot: number }, wx: number, wz: number): { x: number; z: number } => rotateXZ(wx - b.x, wz - b.z, -b.rot);

/** A local rectangle of a building, as a world AABB. */
const worldBox = (b: BuildingSpec, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): Aabb => {
  const a = toWorldOf(b, x0, z0);
  const c = toWorldOf(b, x1, z1);
  return { minX: Math.min(a.x, c.x), maxX: Math.max(a.x, c.x), minY: y0, maxY: y1, minZ: Math.min(a.z, c.z), maxZ: Math.max(a.z, c.z) };
};

const propBox = (def: PropDef, x: number, y: number, z: number, rot: number): Aabb => {
  const f = propFootprint(def, { x, z, rot });
  return { minX: f.minX, maxX: f.maxX, minY: y, maxY: y + def.h, minZ: f.minZ, maxZ: f.maxZ };
};

/** The rotated rectangle of a vehicle as an AABB. */
export const vehicleBox = (key: string, x: number, y: number, z: number, rot: number): Aabb => {
  const def = vehicleByKey(key);
  const c = Math.abs(Math.cos(rot));
  const s = Math.abs(Math.sin(rot));
  const ex = (def.width / 2) * c + (def.length / 2) * s;
  const ez = (def.width / 2) * s + (def.length / 2) * c;
  return { minX: x - ex, maxX: x + ex, minY: y, maxY: y + def.height, minZ: z - ez, maxZ: z + ez };
};

const JOB_OF_INTERIOR: Partial<Record<InteriorKind, JobId>> = {
  police: 'police',
  hospital: 'medic',
  cafe: 'chef',
  burger: 'chef',
  grocery: 'clerk',
  clothing: 'clerk',
  depot: 'delivery',
};

const build = (): CityData => {
  const plan = cityPlan();
  const solids: Aabb[] = [];
  const seats: Seat[] = [];
  const interactables: Interactable[] = [];
  const doors: Door[] = [];
  const displays: DisplayVehicle[] = [];
  const cells: { x: number; y: number; z: number }[] = [];
  const customerSpots: Partial<Record<ShopId, { x: number; y: number; z: number; rot: number }>> = {};

  // The block slabs: every curb is a step.
  for (const block of BLOCKS) {
    solids.push({ minX: block.r.x0, maxX: block.r.x1, minY: -0.6, maxY: CURB, minZ: block.r.z0, maxZ: block.r.z1 });
  }

  const addProp = (key: string, x: number, y: number, z: number, rot: number, building: number, label?: string, shop?: ShopId, job?: JobId): void => {
    const def = propByKey(key);
    if (def.solid) solids.push(propBox(def, x, y, z, rot));
    for (const seat of def.seats ?? []) {
      const o = rotateXZ(seat.x, seat.z, rot);
      seats.push({ id: seats.length, x: x + o.x, y: y + seat.y, z: z + o.z, rot: rot + seat.rot, pose: seat.pose });
    }
    if (def.interact) {
      const front = rotateXZ(0, def.d / 2 + 1.3, rot);
      const back = rotateXZ(0, -(def.d / 2 + 1.4), rot);
      interactables.push({
        id: interactables.length,
        kind: def.interact,
        prop: key,
        label: label ?? def.name,
        x: x + front.x,
        y,
        z: z + front.z,
        bx: x + back.x,
        bz: z + back.z,
        building,
        ...(shop ? { shop } : {}),
        ...(job ? { job } : {}),
      });
    }
  };

  for (const b of plan.buildings) {
    const base = b.base;
    if (!b.interior) {
      const fp = footprintOf(b);
      solids.push({ minX: fp.x0, maxX: fp.x1, minY: base, maxY: base + b.h, minZ: fp.z0, maxZ: fp.z1 });
    } else {
      const hw = b.w / 2;
      const hd = b.d / 2;
      const top = base + INTERIOR_HEIGHT;
      solids.push(worldBox(b, -hw, -hd, hw, -hd + WALL, base, top));
      solids.push(worldBox(b, -hw, -hd, -hw + WALL, hd, base, top));
      solids.push(worldBox(b, hw - WALL, -hd, hw, hd, base, top));
      const list = doorsOf(b.interior, b.w).sort((a, c) => a.offset - c.offset);
      let cursor = -hw;
      for (const door of list) {
        const left = door.offset - door.width / 2;
        const right = door.offset + door.width / 2;
        if (left > cursor) solids.push(worldBox(b, cursor, hd - WALL, left, hd, base, top));
        solids.push(worldBox(b, left, hd - WALL, right, hd, base + door.height, top));
        const at = toWorldOf(b, door.offset, hd);
        doors.push({ id: doors.length, building: b.id, x: at.x, y: base, z: at.z, rot: b.rot, width: door.width, height: door.height, ...(b.house === undefined ? {} : { house: b.house }) });
        cursor = right;
      }
      if (cursor < hw) solids.push(worldBox(b, cursor, hd - WALL, hw, hd, base, top));
      // Ceiling and the floors above it.
      solids.push(worldBox(b, -hw, -hd, hw, hd, top, base + Math.max(b.h, INTERIOR_HEIGHT + 0.6)));

      const layout = interiorLayout(b.interior, b.w, b.d);
      const job = JOB_OF_INTERIOR[b.interior];
      for (const wall of layout.walls ?? []) solids.push(worldBox(b, wall.x0, wall.z0, wall.x1, wall.z1, base, base + (wall.h ?? INTERIOR_HEIGHT)));
      for (const lp of layout.props) placeLocal(b, lp, base, (key, x, y, z, rot, label) => addProp(key, x, y, z, rot, b.id, label, b.shop, job));
      for (const d of layout.displays ?? []) {
        const at = toWorldOf(b, d.x, d.z);
        const rot = b.rot + (d.rot ?? 0);
        displays.push({ key: d.vehicle!, x: at.x, y: base + (d.vehicle === 'firetruck' || d.vehicle === 'plane' ? 0 : 0.4), z: at.z, rot });
        solids.push(vehicleBox(d.vehicle!, at.x, base, at.z, rot));
      }
      for (const cell of layout.spots?.['cells'] ?? []) {
        const at = toWorldOf(b, cell.x, cell.z);
        cells.push({ x: at.x, y: base, z: at.z });
      }
      const customer = layout.spots?.['customer']?.[0];
      if (customer && b.shop) {
        const at = toWorldOf(b, customer.x, customer.z);
        customerSpots[b.shop] = { x: at.x, y: base, z: at.z, rot: b.rot + Math.PI };
      }
    }
    // Towers: each tier is a box from the one below to its own top.
    let below = base + b.h;
    for (const tier of b.tiers ?? []) {
      const side = Math.abs(Math.sin(b.rot)) > 0.5;
      const ex = (side ? tier.d : tier.w) / 2;
      const ez = (side ? tier.w : tier.d) / 2;
      solids.push({ minX: b.x - ex, maxX: b.x + ex, minY: below, maxY: base + tier.top, minZ: b.z - ez, maxZ: b.z + ez });
      below = base + tier.top;
    }
  }

  // Street props, the beach, the parks.
  for (const p of plan.props) {
    const label = p.key === 'locker' ? 'Taxi Dispatch' : p.key === 'boat_kiosk' ? 'Boat Rentals' : undefined;
    const job: JobId | undefined = p.key === 'locker' ? 'taxi' : undefined;
    const shop: ShopId | undefined = p.key === 'vending' ? 'vending' : undefined;
    addProp(p.key, p.x, p.y, p.z, p.rot, -1, label, shop, job);
  }
  // Parked cars and boats.
  for (const v of plan.parked) solids.push(vehicleBox(v.key, v.x, v.floating ? WATER_Y - 1 : CURB, v.z, v.rot));
  // Docks, piers and the bridge decks.
  for (const d of plan.docks) solids.push({ minX: d.x0, maxX: d.x1, minY: d.top - 1.2, maxY: d.top, minZ: d.z0, maxZ: d.z1 });
  for (const s of plan.solids) solids.push(s);
  // Trunks and poles.
  for (const palm of plan.palms) solids.push({ minX: palm.x - 0.6, maxX: palm.x + 0.6, minY: palm.y, maxY: palm.y + 7, minZ: palm.z - 0.6, maxZ: palm.z + 0.6 });
  for (const tree of plan.trees) solids.push({ minX: tree.x - 0.7, maxX: tree.x + 0.7, minY: tree.y, maxY: tree.y + 5, minZ: tree.z - 0.7, maxZ: tree.z + 0.7 });
  for (const lamp of plan.lamps) solids.push({ minX: lamp.x - 0.4, maxX: lamp.x + 0.4, minY: lamp.y, maxY: lamp.y + 11, minZ: lamp.z - 0.4, maxZ: lamp.z + 0.4 });
  for (const sig of plan.signals) solids.push({ minX: sig.x - 0.5, maxX: sig.x + 0.5, minY: CURB, maxY: CURB + 10, minZ: sig.z - 0.5, maxZ: sig.z + 0.5 });
  for (const lm of plan.landmarks) {
    if (lm.kind === 'welcome_sign') solids.push({ minX: lm.x - 1.5, maxX: lm.x + 1.5, minY: 0, maxY: 7, minZ: lm.z - 12, maxZ: lm.z + 12 });
  }

  const places = buildPlaces(plan, doors);
  const placeById = new Map(places.map((p) => [p.id, p]));
  return {
    plan,
    solids,
    ramps: plan.ramps,
    seats,
    interactables,
    doors,
    displays,
    places,
    placeById,
    cells,
    customerSpots,
    doorsteps: buildDoorsteps(plan),
    curbside: buildCurbside(),
  };
};

const placeLocal = (
  b: BuildingSpec,
  lp: LocalProp,
  base: number,
  add: (key: string, x: number, y: number, z: number, rot: number, label?: string) => void,
): void => {
  const at = toWorldOf(b, lp.x, lp.z);
  add(lp.key, at.x, base, at.z, b.rot + (lp.rot ?? 0), lp.label);
};

/** The point just outside a building's front door, and the yaw that faces the door. */
export const outsideDoor = (b: Pick<BuildingSpec, 'x' | 'z' | 'd' | 'rot'>, distance = 4): { x: number; z: number; yaw: number } => {
  const at = toWorldOf(b, 0, b.d / 2 + distance);
  return { x: at.x, z: at.z, yaw: b.rot + Math.PI };
};

/** Just inside a building's front door. */
export const insideDoor = (b: Pick<BuildingSpec, 'x' | 'z' | 'd' | 'rot'>, distance = 3): { x: number; z: number; yaw: number } => {
  const at = toWorldOf(b, 0, b.d / 2 - distance);
  return { x: at.x, z: at.z, yaw: b.rot + Math.PI };
};

const buildPlaces = (plan: CityPlan, _doors: Door[]): Place[] => {
  const out: Place[] = [];
  const byName = (name: string): BuildingSpec => {
    const found = plan.buildings.find((b) => b.name === name);
    if (!found) throw new Error(`no building ${name}`);
    return found;
  };
  const at = (id: string, name: string, building: string, icon: PlaceIcon, listed = true): void => {
    const b = byName(building);
    const o = outsideDoor(b, b.kind === 'tower' ? 26 : 7);
    out.push({ id, name, x: o.x, y: b.base, z: o.z, yaw: o.yaw, icon, listed });
  };
  const cityHall = byName('City Hall');
  const plaza = toWorldOf(cityHall, 0, cityHall.d / 2 + 22);
  out.push({ id: 'spawn', name: 'City Hall Plaza', x: plaza.x, y: CURB, z: plaza.z, yaw: cityHall.rot + Math.PI, icon: 'job', listed: true });
  at('cityhall', 'City Hall & Job Center', 'City Hall', 'job');
  at('police', 'Police Station', 'Palmhaven Police', 'police');
  at('hospital', 'Palmhaven General', 'Palmhaven General', 'hospital');
  at('fire', 'Fire Station 7', 'Fire Station 7', 'fire');
  at('bank', 'Bank of Palmhaven', 'Bank of Palmhaven', 'bank');
  at('clothing', 'Coastline Threads', 'Coastline Threads', 'shop');
  at('grocery', 'FreshMart', 'FreshMart', 'shop');
  at('furniture', 'Casa Home', 'Casa Home', 'shop');
  at('cafe', 'Sunset Cafe', 'Sunset Cafe', 'food');
  at('burger', 'Palm Burger', 'Palm Burger', 'food');
  at('dealer', 'Palm Motors', 'Palm Motors', 'car');
  at('gas', 'Sun Fuel', 'Sun Fuel Mart', 'gas');
  at('taxi', 'Taxi Dispatch', 'Taxi Dispatch', 'taxi');
  at('depot', 'PalmPost Depot', 'PalmPost Depot', 'box');
  at('tower', 'Palmhaven Tower', 'Palmhaven Tower', 'landmark');
  at('school', 'Palmhaven High', 'Palmhaven High', 'landmark', false);
  at('airport', 'Palmhaven International', 'Palmhaven International', 'plane');
  at('hangar', 'Airport Hangars', 'Hangar', 'plane', false);
  at('marina', 'Palmhaven Marina', 'Palmhaven Marina', 'boat');
  at('bayclub', 'The Bay Club', 'The Bay Club', 'landmark', false);
  const park = BLOCKS.find((b) => b.col === 1 && b.row === 4)!;
  out.push({ id: 'park', name: 'Central Park', x: (park.r.x0 + park.r.x1) / 2, y: CURB, z: park.r.z1 - 12, yaw: Math.PI, icon: 'park', listed: true });
  out.push({ id: 'beach', name: 'Palm Pier & Beach', x: 290, y: 0, z: 262, yaw: H, icon: 'beach', listed: true });
  out.push({ id: 'lighthouse', name: 'North Point Lighthouse', x: 40, y: 0, z: -800, yaw: Math.PI, icon: 'landmark', listed: true });
  out.push({ id: 'southpointe', name: 'South Pointe Park', x: 30, y: CURB, z: 580, yaw: 0, icon: 'park', listed: true });
  return out;
};

/** Every front door in town that a parcel could go to. */
const buildDoorsteps = (plan: CityPlan): { x: number; y: number; z: number; label: string }[] => {
  const out: { x: number; y: number; z: number; label: string }[] = [];
  for (const b of plan.buildings) {
    if (b.kind !== 'house' && b.kind !== 'deco' && b.kind !== 'storefront' && b.kind !== 'condo') continue;
    const o = outsideDoor(b, 2.2);
    out.push({ x: o.x, y: b.base, z: o.z, label: b.kind === 'house' && b.name !== 'Private Residence' ? b.name : b.name === 'Private Residence' ? 'a family home' : b.name });
  }
  return out;
};

/** Sidewalk points by the curb, mid-block on every side of the grid. */
const buildCurbside = (): { x: number; y: number; z: number; label: string }[] => {
  const out: { x: number; y: number; z: number; label: string }[] = [];
  const name = (b: Block, side: 'n' | 's' | 'e' | 'w'): string => {
    if (side === 'n') return STREETS[b.row]!.name;
    if (side === 's') return STREETS[b.row + 1]!.name;
    if (side === 'w') return AVENUES[b.col]!.name;
    return AVENUES[b.col + 1]!.name;
  };
  for (const b of BLOCKS) {
    if (b.col < 0 || b.col > 2) continue;
    const mx = (b.r.x0 + b.r.x1) / 2 + 7;
    const mz = (b.r.z0 + b.r.z1) / 2 + 7;
    const inset = 2.2;
    out.push({ x: mx, y: CURB, z: b.r.z0 + inset, label: name(b, 'n') });
    out.push({ x: mx, y: CURB, z: b.r.z1 - inset, label: name(b, 's') });
    out.push({ x: b.r.x0 + inset, y: CURB, z: mz, label: name(b, 'w') });
    out.push({ x: b.r.x1 - inset, y: CURB, z: mz, label: name(b, 'e') });
  }
  void ROAD_HALF;
  void SIDEWALK;
  return out;
};

let cached: CityData | null = null;

/** The assembled city, built once per process. */
export const city = (): CityData => {
  cached ??= build();
  return cached;
};

/** The building a house plot lives in. */
export const houseBuilding = (plot: HousePlot): BuildingSpec => city().plan.buildings[plot.building]!;

/** A house's furniture area in world terms (for the server's checks). */
export const houseStyleOf = (plot: HousePlot) => HOUSE_STYLES[plot.style];

/** The named place, or the spawn. */
export const placeOf = (id: string): Place => city().placeById.get(id) ?? city().placeById.get('spawn')!;
