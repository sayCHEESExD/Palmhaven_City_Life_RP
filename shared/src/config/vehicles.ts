import type { JobId } from './jobs.js';

/**
 * THE FLEET. A small set of vehicles that all run on one simulation
 * (`sim/VehicleSim.ts`) with per-class handling, so a sports car, an
 * ambulance and a bicycle differ in numbers, not in code.
 *
 * Local frame: +z is forward, +x is the vehicle's LEFT (the driver of a
 * left-hand-drive car sits at +x), y up from the ground under the wheels.
 */

export type VehicleClass = 'car' | 'bike' | 'board' | 'boat' | 'heli' | 'plane';

export type SeatKind = 'drive' | 'sit' | 'ride' | 'stand';

export interface VehicleSeat {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly kind: SeatKind;
}

export interface Handling {
  /** Top speed forward, world units per second. */
  readonly maxSpeed: number;
  readonly reverseSpeed: number;
  /** Forward acceleration at rest (falls off toward top speed). */
  readonly accel: number;
  readonly brake: number;
  /** Peak yaw rate, radians per second. */
  readonly steer: number;
  /** How hard sideways slip is killed, per second (lower = driftier). */
  readonly grip: number;
  /** Nitro: extra acceleration and top-speed multiplier while it lasts (0 = none). */
  readonly boost: number;
  /** Aircraft: climb rate (units/s). Planes: take-off speed is `takeoff`. */
  readonly climb?: number;
  readonly takeoff?: number;
}

export interface VehicleDef {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly class: VehicleClass;
  readonly blurb: string;
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly seats: readonly VehicleSeat[];
  readonly handling: Handling;
  /** 0 = free for everyone. */
  readonly price: number;
  /** A job vehicle: only spawnable while on that job. */
  readonly job?: JobId;
  readonly paints: readonly number[];
  /** Uses fuel (units of fuel per 100 world units driven). 0 = pedal power. */
  readonly fuelUse: number;
  readonly siren?: boolean;
  /** Chase camera: distance and height. */
  readonly camera: { readonly distance: number; readonly height: number };
  /** The phone's vehicle app sorts by this. */
  readonly category: 'cars' | 'boats' | 'helicopters' | 'motorcycles' | 'airplanes' | 'utility';
  /** Scenery only (the fire trucks): never spawned or sold. */
  readonly hidden?: boolean;
}

const seat = (x: number, y: number, z: number, kind: SeatKind = 'sit'): VehicleSeat => ({ x, y, z, kind });

const CAR_SEATS = [seat(0.95, 0.85, 0.4, 'drive'), seat(-0.95, 0.85, 0.4), seat(0.95, 0.85, -1.9), seat(-0.95, 0.85, -1.9)];

const RAW: readonly Omit<VehicleDef, 'id'>[] = [
  {
    key: 'sedan', name: 'Palm Cruiser', class: 'car', category: 'cars', blurb: 'A friendly four-door for getting around town.',
    length: 9.4, width: 4.3, height: 3.4, seats: CAR_SEATS,
    handling: { maxSpeed: 72, reverseSpeed: 22, accel: 26, brake: 60, steer: 1.9, grip: 9, boost: 14 },
    price: 0, paints: [0xf2f2f2, 0xd94a4a, 0x3a7bd5, 0x2f2f36, 0x58c27d, 0xf5c542], fuelUse: 1.4, camera: { distance: 15, height: 4.2 },
  },
  {
    key: 'suv', name: 'Coastline SUV', class: 'car', category: 'cars', blurb: 'Big, tall and comfy. Seats the whole crew.',
    length: 10.4, width: 4.8, height: 4.4, seats: [seat(1.05, 1.25, 0.8, 'drive'), seat(-1.05, 1.25, 0.8), seat(1.05, 1.25, -1.6), seat(-1.05, 1.25, -1.6)],
    handling: { maxSpeed: 76, reverseSpeed: 22, accel: 27, brake: 58, steer: 1.75, grip: 9, boost: 14 },
    price: 9000, paints: [0x8c2f4b, 0x1f2a44, 0xe9e4da, 0x2e4d3a, 0x9aa0a6], fuelUse: 1.8, camera: { distance: 16, height: 4.8 },
  },
  {
    key: 'sports', name: 'Vortex GT', class: 'car', category: 'cars', blurb: 'A hypercar. Hold SHIFT and hang on.',
    length: 9.8, width: 4.6, height: 2.7, seats: [seat(0.85, 0.55, 0.1, 'drive'), seat(-0.85, 0.55, 0.1)],
    handling: { maxSpeed: 122, reverseSpeed: 26, accel: 46, brake: 80, steer: 2.05, grip: 10, boost: 30 },
    price: 45000, paints: [0x5ec8f2, 0xe8e8ec, 0x111318, 0xf06a2a, 0xa83ad8], fuelUse: 2.2, camera: { distance: 15, height: 3.8 },
  },
  {
    key: 'luxury', name: 'Royale', class: 'car', category: 'cars', blurb: 'Old money on four wheels.',
    length: 11, width: 4.6, height: 3.8, seats: [seat(1, 1, 0.9, 'drive'), seat(-1, 1, 0.9), seat(1, 1, -2), seat(-1, 1, -2)],
    handling: { maxSpeed: 90, reverseSpeed: 22, accel: 30, brake: 62, steer: 1.7, grip: 9, boost: 16 },
    price: 32000, paints: [0xf3f1ec, 0x1c1c22, 0x5a1a22, 0x23324f], fuelUse: 1.9, camera: { distance: 16.5, height: 4.4 },
  },
  {
    key: 'convertible', name: 'Sunset Convertible', class: 'car', category: 'cars', blurb: 'Top down along Ocean Drive.',
    length: 9.6, width: 4.4, height: 2.6, seats: [seat(0.95, 0.7, 0.1, 'drive'), seat(-0.95, 0.7, 0.1)],
    handling: { maxSpeed: 92, reverseSpeed: 24, accel: 34, brake: 66, steer: 2, grip: 9, boost: 20 },
    price: 18000, paints: [0xff6f91, 0x6fd3c4, 0xfff1d6, 0xd9363e, 0x2a2a2a], fuelUse: 1.6, camera: { distance: 15, height: 4 },
  },
  {
    key: 'pickup', name: 'Gator Pickup', class: 'car', category: 'cars', blurb: 'Haul anything. Ride in the bed.',
    length: 11, width: 4.8, height: 4.2, seats: [seat(1.05, 1.3, 1.4, 'drive'), seat(-1.05, 1.3, 1.4), seat(1.1, 1.5, -2.6), seat(-1.1, 1.5, -2.6)],
    handling: { maxSpeed: 74, reverseSpeed: 22, accel: 26, brake: 56, steer: 1.7, grip: 8.5, boost: 14 },
    price: 12000, paints: [0xc9572e, 0x2d4f7c, 0xe4e1d8, 0x3b3b3b, 0x6b8f3a], fuelUse: 2, camera: { distance: 16.5, height: 4.8 },
  },
  {
    key: 'police', name: 'Police Cruiser', class: 'car', category: 'utility', blurb: 'Lights, siren, justice.', job: 'police', siren: true,
    length: 10, width: 4.4, height: 3.6, seats: CAR_SEATS,
    handling: { maxSpeed: 96, reverseSpeed: 26, accel: 36, brake: 72, steer: 2, grip: 10, boost: 22 },
    price: 0, paints: [0x14181f], fuelUse: 1.4, camera: { distance: 15.5, height: 4.3 },
  },
  {
    key: 'ambulance', name: 'Ambulance', class: 'car', category: 'utility', blurb: 'Patients in the back, siren on.', job: 'medic', siren: true,
    length: 12.4, width: 5, height: 5.6, seats: [seat(1.05, 1.4, 3, 'drive'), seat(-1.05, 1.4, 3), seat(1.1, 1.4, -2.2), seat(-1.1, 1.4, -2.2)],
    handling: { maxSpeed: 84, reverseSpeed: 22, accel: 30, brake: 60, steer: 1.7, grip: 9, boost: 18 },
    price: 0, paints: [0xf4f4f4], fuelUse: 1.8, camera: { distance: 18, height: 5.6 },
  },
  {
    key: 'taxi', name: 'Taxi', class: 'car', category: 'utility', blurb: 'Pick up fares all over Palmhaven.', job: 'taxi',
    length: 9.6, width: 4.3, height: 3.6, seats: CAR_SEATS,
    handling: { maxSpeed: 80, reverseSpeed: 22, accel: 30, brake: 62, steer: 1.95, grip: 9.5, boost: 16 },
    price: 0, paints: [0xffc61a], fuelUse: 1.4, camera: { distance: 15, height: 4.2 },
  },
  {
    key: 'van', name: 'PalmPost Van', class: 'car', category: 'utility', blurb: 'Parcels from the depot to the doorstep.', job: 'delivery',
    length: 11.6, width: 5, height: 5.6, seats: [seat(1.05, 1.4, 3, 'drive'), seat(-1.05, 1.4, 3)],
    handling: { maxSpeed: 76, reverseSpeed: 20, accel: 26, brake: 56, steer: 1.75, grip: 9, boost: 14 },
    price: 0, paints: [0xf7f3ea], fuelUse: 1.9, camera: { distance: 18, height: 5.6 },
  },
  {
    key: 'motorcycle', name: 'Palm Rider', class: 'bike', category: 'motorcycles', blurb: 'Two wheels, wind in your hair.',
    length: 6.2, width: 1.8, height: 3.2, seats: [seat(0, 1.4, -0.2, 'drive'), seat(0, 1.55, -1.6, 'ride')],
    handling: { maxSpeed: 100, reverseSpeed: 12, accel: 40, brake: 70, steer: 2.3, grip: 11, boost: 22 },
    price: 7500, paints: [0xd6242f, 0x111111, 0x2a6fd8, 0xf2f2f2], fuelUse: 1, camera: { distance: 12.5, height: 3.8 },
  },
  {
    key: 'bicycle', name: 'Beach Cruiser', class: 'bike', category: 'motorcycles', blurb: 'Pedal along the promenade.',
    length: 5.2, width: 1.6, height: 3, seats: [seat(0, 1.55, -0.4, 'drive')],
    handling: { maxSpeed: 34, reverseSpeed: 6, accel: 20, brake: 40, steer: 2.6, grip: 12, boost: 0 },
    price: 0, paints: [0x6fd3c4, 0xff6f91, 0xffd166, 0x9b5de5], fuelUse: 0, camera: { distance: 11, height: 3.6 },
  },
  {
    key: 'skateboard', name: 'Skateboard', class: 'board', category: 'motorcycles', blurb: 'Kick, push, coast.',
    length: 3.2, width: 1.2, height: 0.5, seats: [seat(0, 0.45, 0, 'stand')],
    handling: { maxSpeed: 30, reverseSpeed: 5, accel: 16, brake: 34, steer: 2.6, grip: 10, boost: 0 },
    price: 0, paints: [0xff5d5d, 0x48c9b0, 0xf9d342, 0x3c3c3c], fuelUse: 0, camera: { distance: 11, height: 3.5 },
  },
  {
    key: 'speedboat', name: 'Wave Dancer', class: 'boat', category: 'boats', blurb: 'A sleek speedboat for the bay.',
    length: 13, width: 5, height: 3.4, seats: [seat(1, 1.4, 0.6, 'drive'), seat(-1, 1.4, 0.6), seat(1, 1.4, -2.6), seat(-1, 1.4, -2.6)],
    handling: { maxSpeed: 74, reverseSpeed: 14, accel: 24, brake: 26, steer: 1.4, grip: 2.6, boost: 16 },
    price: 14000, paints: [0xffffff, 0xd94a4a, 0x1e5fa8, 0x15171c], fuelUse: 1.6, camera: { distance: 20, height: 6 },
  },
  {
    key: 'jetski', name: 'Jet Ski', class: 'boat', category: 'boats', blurb: 'Fast, splashy, fun.',
    length: 6.4, width: 2.4, height: 2.2, seats: [seat(0, 1.5, -0.2, 'drive'), seat(0, 1.6, -1.6, 'ride')],
    handling: { maxSpeed: 82, reverseSpeed: 10, accel: 34, brake: 30, steer: 2.1, grip: 3, boost: 18 },
    price: 6000, paints: [0xffd23f, 0x3ec1d3, 0xff4d6d, 0x2b2d42], fuelUse: 1, camera: { distance: 13, height: 4.4 },
  },
  {
    key: 'yacht', name: 'Palmhaven Yacht', class: 'boat', category: 'boats', blurb: 'Your own floating party.',
    length: 30, width: 10, height: 10, seats: [seat(2, 4.4, 6, 'drive'), seat(-2, 4.4, 6), seat(-3, 1.9, -2), seat(3, 1.9, -2), seat(-3, 1.9, -7), seat(3, 1.9, -7), seat(0, 1.9, -11), seat(-2, 4.4, 2)],
    handling: { maxSpeed: 44, reverseSpeed: 10, accel: 10, brake: 14, steer: 0.75, grip: 2.2, boost: 0 },
    price: 85000, paints: [0xf6f6f2, 0x1b2a41], fuelUse: 3, camera: { distance: 38, height: 14 },
  },
  {
    key: 'heli', name: 'Sky Hopper', class: 'heli', category: 'helicopters', blurb: 'Hover anywhere. SPACE up, C down.',
    length: 13, width: 3.6, height: 4.6, seats: [seat(0.8, 1.2, 1.6, 'drive'), seat(-0.8, 1.2, 1.6), seat(0.8, 1.2, -0.4), seat(-0.8, 1.2, -0.4)],
    handling: { maxSpeed: 82, reverseSpeed: 24, accel: 26, brake: 30, steer: 1.6, grip: 3, boost: 0, climb: 22 },
    price: 60000, paints: [0x2b6cb0, 0xe53e3e, 0xf6e05e, 0x1a202c, 0xf7fafc], fuelUse: 2, camera: { distance: 22, height: 6 },
  },
  {
    key: 'plane', name: 'Cloud Cub', class: 'plane', category: 'airplanes', blurb: 'W/S throttle, SPACE pull up, C dive.',
    length: 14, width: 18, height: 5, seats: [seat(0, 1.6, 1.2, 'drive'), seat(0, 1.6, -0.9)],
    handling: { maxSpeed: 150, reverseSpeed: 0, accel: 18, brake: 30, steer: 0.95, grip: 6, boost: 0, climb: 24, takeoff: 46 },
    price: 50000, paints: [0xf2f2f2, 0xe8c547, 0xd64545, 0x2f6fb5], fuelUse: 2.4, camera: { distance: 30, height: 8 },
  },
  {
    key: 'firetruck', name: 'Fire Engine', class: 'car', category: 'utility', blurb: "Station 7's pride.", hidden: true,
    length: 15, width: 5.4, height: 6.4, seats: [seat(1.1, 1.8, 4.6, 'drive'), seat(-1.1, 1.8, 4.6)],
    handling: { maxSpeed: 70, reverseSpeed: 18, accel: 22, brake: 50, steer: 1.4, grip: 9, boost: 0 },
    price: 0, paints: [0xd62828], fuelUse: 2, camera: { distance: 22, height: 7 },
  },
];

export const VEHICLES: readonly VehicleDef[] = RAW.map((def, i) => ({ ...def, id: i + 1 }));

const BY_ID = new Map(VEHICLES.map((v) => [v.id, v]));
const BY_KEY = new Map(VEHICLES.map((v) => [v.key, v]));

export const vehicleById = (id: number): VehicleDef | undefined => BY_ID.get(id);
export const vehicleByKey = (key: string): VehicleDef => {
  const def = BY_KEY.get(key);
  if (!def) throw new Error(`unknown vehicle ${key}`);
  return def;
};

/** Vehicles everybody has without buying. */
export const FREE_VEHICLES: readonly number[] = VEHICLES.filter((v) => v.price === 0 && !v.job && !v.hidden).map((v) => v.id);

/** Full tank. */
export const FUEL_MAX = 100;
/** Fuel costs this much per unit at a pump. */
export const FUEL_PRICE = 1;

/** Vehicles on water. */
export const isBoat = (def: VehicleDef): boolean => def.class === 'boat';
export const isAircraft = (def: VehicleDef): boolean => def.class === 'heli' || def.class === 'plane';
