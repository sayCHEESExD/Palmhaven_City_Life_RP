/**
 * EVERY PLACEABLE THING in Palmhaven: furniture, shop fittings, street
 * furniture, beach and playground gear. One catalogue, read by the server
 * (collision, seats, interactions) and the client (models), and also the
 * furniture shop's stock - a sofa in the shop is the same sofa in a hotel lobby.
 *
 * Dimensions are LOCAL: `w` along local x, `d` along local z, `h` up. A prop
 * faces local +z (a sofa's seat looks toward +z). Seats are in the same frame.
 */

export type SeatPose = 'sit' | 'lie' | 'swing' | 'ride';

export interface SeatSpot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Facing, relative to the prop (0 = local +z). */
  readonly rot: number;
  readonly pose: SeatPose;
}

/** What pressing E at a prop does. */
export type InteractKind =
  | 'register'
  | 'station'
  | 'atm'
  | 'pump'
  | 'bed'
  | 'jobdesk'
  | 'mirror'
  | 'vending'
  | 'arcade'
  | 'piano'
  | 'locker'
  | 'depot'
  | 'jail'
  | 'hangar'
  | 'boats'
  | 'dealer';

export type FurnitureCategory = 'living' | 'bedroom' | 'kitchen' | 'bath' | 'decor' | 'outdoor' | 'fun';

export interface PropDef {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly w: number;
  readonly d: number;
  readonly h: number;
  /** Blocks movement (an AABB of the rotated footprint, h tall). */
  readonly solid: boolean;
  /** For tall thin things (lamps, palms): the solid part is this square at the base instead of the footprint. */
  readonly core?: number;
  readonly seats?: readonly SeatSpot[];
  readonly interact?: InteractKind;
  /** Sold at Casa Home and placeable in a house. */
  readonly furniture?: { readonly price: number; readonly category: FurnitureCategory };
  /** Hung on a wall: placed at this height. */
  readonly wallY?: number;
}

const s = (x: number, y: number, z: number, rot = 0, pose: SeatPose = 'sit'): SeatSpot => ({ x, y, z, rot, pose });

const RAW: readonly Omit<PropDef, 'id'>[] = [
  // ------------------------------------------------------------ living room
  { key: 'sofa', name: 'Sofa', w: 6, d: 2.6, h: 2.6, solid: true, seats: [s(-1.7, 1.1, 0.25), s(0, 1.1, 0.25), s(1.7, 1.1, 0.25)], furniture: { price: 650, category: 'living' } },
  { key: 'sofa_corner', name: 'Corner Sofa', w: 6.4, d: 6.4, h: 2.6, solid: true, seats: [s(-1.6, 1.1, -1.9), s(0.4, 1.1, -1.9), s(-1.9, 1.1, 0.4, Math.PI / 2), s(-1.9, 1.1, 2.2, Math.PI / 2)], furniture: { price: 1200, category: 'living' } },
  { key: 'armchair', name: 'Armchair', w: 2.8, d: 2.6, h: 2.6, solid: true, seats: [s(0, 1.1, 0.25)], furniture: { price: 320, category: 'living' } },
  { key: 'bean_bag', name: 'Bean Bag', w: 2.4, d: 2.4, h: 1.4, solid: true, seats: [s(0, 0.7, 0.1)], furniture: { price: 120, category: 'living' } },
  { key: 'coffee_table', name: 'Coffee Table', w: 3.6, d: 2, h: 1.1, solid: true, furniture: { price: 180, category: 'living' } },
  { key: 'tv', name: 'Big Screen TV', w: 5, d: 1.4, h: 4.4, solid: true, furniture: { price: 900, category: 'living' } },
  { key: 'bookshelf', name: 'Bookshelf', w: 4, d: 1.4, h: 6.4, solid: true, furniture: { price: 260, category: 'living' } },
  { key: 'floor_lamp', name: 'Floor Lamp', w: 1.2, d: 1.2, h: 5.4, solid: false, furniture: { price: 90, category: 'decor' } },
  { key: 'plant', name: 'Potted Palm', w: 1.6, d: 1.6, h: 3.8, solid: true, furniture: { price: 70, category: 'decor' } },
  { key: 'rug', name: 'Rug', w: 6, d: 4.4, h: 0.06, solid: false, furniture: { price: 110, category: 'decor' } },
  { key: 'wall_art', name: 'Beach Painting', w: 3.2, d: 0.2, h: 2.4, solid: false, wallY: 3.6, furniture: { price: 150, category: 'decor' } },
  { key: 'aquarium', name: 'Aquarium', w: 4, d: 1.6, h: 4, solid: true, furniture: { price: 700, category: 'decor' } },
  { key: 'piano', name: 'Grand Piano', w: 4.4, d: 4.6, h: 3.4, solid: true, interact: 'piano', seats: [s(0, 1.2, 3, Math.PI)], furniture: { price: 2500, category: 'fun' } },
  { key: 'arcade', name: 'Arcade Cabinet', w: 2.2, d: 2.2, h: 5.6, solid: true, interact: 'arcade', furniture: { price: 1100, category: 'fun' } },
  { key: 'pool_table', name: 'Pool Table', w: 4.6, d: 7.6, h: 2.3, solid: true, furniture: { price: 1400, category: 'fun' } },
  // --------------------------------------------------------------- bedroom
  { key: 'bed', name: 'Double Bed', w: 4.6, d: 6.6, h: 2.6, solid: true, seats: [s(-1, 1.5, -0.6, 0, 'lie'), s(1, 1.5, -0.6, 0, 'lie')], furniture: { price: 800, category: 'bedroom' } },
  { key: 'bed_single', name: 'Single Bed', w: 2.8, d: 6.2, h: 2.4, solid: true, seats: [s(0, 1.4, -0.5, 0, 'lie')], furniture: { price: 420, category: 'bedroom' } },
  { key: 'dresser', name: 'Dresser', w: 4, d: 1.8, h: 3.4, solid: true, furniture: { price: 300, category: 'bedroom' } },
  { key: 'desk', name: 'Desk', w: 4, d: 2, h: 2.4, solid: true, furniture: { price: 260, category: 'bedroom' } },
  { key: 'office_chair', name: 'Desk Chair', w: 1.8, d: 1.8, h: 3.4, solid: true, seats: [s(0, 1.3, 0)], furniture: { price: 140, category: 'bedroom' } },
  { key: 'wardrobe', name: 'Wardrobe', w: 4, d: 2, h: 6.6, solid: true, furniture: { price: 380, category: 'bedroom' } },
  // --------------------------------------------------------------- kitchen
  { key: 'fridge', name: 'Fridge', w: 2.6, d: 2.4, h: 6.4, solid: true, furniture: { price: 550, category: 'kitchen' } },
  { key: 'kitchen_counter', name: 'Kitchen Counter', w: 6, d: 2.4, h: 3, solid: true, furniture: { price: 480, category: 'kitchen' } },
  { key: 'stove', name: 'Stove', w: 2.6, d: 2.4, h: 3, solid: true, furniture: { price: 420, category: 'kitchen' } },
  { key: 'dining_table', name: 'Dining Table', w: 5, d: 3, h: 2.2, solid: true, furniture: { price: 340, category: 'kitchen' } },
  { key: 'chair', name: 'Dining Chair', w: 1.6, d: 1.6, h: 3, solid: true, seats: [s(0, 1.2, 0)], furniture: { price: 80, category: 'kitchen' } },
  { key: 'bar_stool', name: 'Bar Stool', w: 1.2, d: 1.2, h: 2.6, solid: true, seats: [s(0, 2.3, 0)], furniture: { price: 70, category: 'kitchen' } },
  // ------------------------------------------------------------------ bath
  { key: 'toilet', name: 'Toilet', w: 1.6, d: 2.2, h: 2.6, solid: true, seats: [s(0, 1.2, 0.3)], furniture: { price: 160, category: 'bath' } },
  { key: 'bathtub', name: 'Bathtub', w: 2.8, d: 5.4, h: 1.8, solid: true, seats: [s(0, 0.7, 0, 0, 'lie')], furniture: { price: 520, category: 'bath' } },
  { key: 'sink', name: 'Vanity Sink', w: 2.6, d: 1.6, h: 3, solid: true, furniture: { price: 200, category: 'bath' } },
  // --------------------------------------------------------------- outdoor
  { key: 'hot_tub', name: 'Hot Tub', w: 7, d: 7, h: 1.8, solid: true, seats: [s(0, 1, -2.2), s(-2.2, 1, 0, Math.PI / 2), s(2.2, 1, 0, -Math.PI / 2), s(0, 1, 2.2, Math.PI)], furniture: { price: 3200, category: 'outdoor' } },
  { key: 'sun_lounger', name: 'Sun Lounger', w: 2, d: 5.4, h: 1.4, solid: true, seats: [s(0, 1, 0.2, 0, 'lie')], furniture: { price: 160, category: 'outdoor' } },
  { key: 'bbq', name: 'BBQ Grill', w: 2.6, d: 1.8, h: 3.2, solid: true, furniture: { price: 260, category: 'outdoor' } },
  { key: 'patio_set', name: 'Patio Table', w: 4, d: 4, h: 6.4, solid: true, core: 3, furniture: { price: 300, category: 'outdoor' } },
  { key: 'flamingo', name: 'Lawn Flamingo', w: 1, d: 1.4, h: 3, solid: false, furniture: { price: 40, category: 'outdoor' } },
  // ------------------------------------------------------------ commercial
  { key: 'counter', name: 'Counter', w: 8, d: 2.4, h: 3, solid: true, interact: 'register' },
  { key: 'shelf', name: 'Shelf', w: 8, d: 2.2, h: 6, solid: true },
  { key: 'cooler', name: 'Drinks Cooler', w: 6, d: 2.4, h: 7, solid: true },
  { key: 'clothes_rack', name: 'Clothes Rack', w: 5, d: 1.8, h: 5, solid: true },
  { key: 'mannequin', name: 'Mannequin', w: 1.6, d: 1.6, h: 4.4, solid: true },
  { key: 'mirror', name: 'Mirror', w: 3, d: 0.6, h: 6.4, solid: true, interact: 'mirror' },
  { key: 'booth', name: 'Diner Booth', w: 4.2, d: 6.6, h: 3, solid: true, seats: [s(-1, 1.2, -2.3), s(1, 1.2, -2.3), s(-1, 1.2, 2.3, Math.PI), s(1, 1.2, 2.3, Math.PI)] },
  { key: 'cafe_table', name: 'Cafe Table', w: 2.6, d: 2.6, h: 2.2, solid: true },
  { key: 'coffee_machine', name: 'Espresso Machine', w: 2.6, d: 2, h: 4.2, solid: true, interact: 'station' },
  { key: 'fryer', name: 'Fryer', w: 2.6, d: 2.4, h: 3.2, solid: true, interact: 'station' },
  { key: 'grill', name: 'Flat Grill', w: 3.2, d: 2.4, h: 3.2, solid: true, interact: 'station' },
  { key: 'soda_fountain', name: 'Soda Fountain', w: 2.4, d: 2, h: 4.4, solid: true, interact: 'station' },
  { key: 'display_case', name: 'Pastry Case', w: 4, d: 2.2, h: 3.6, solid: true, interact: 'station' },
  { key: 'hospital_bed', name: 'Hospital Bed', w: 3, d: 6.4, h: 2.8, solid: true, interact: 'bed', seats: [s(0, 1.7, -0.4, 0, 'lie')] },
  { key: 'monitor', name: 'Heart Monitor', w: 1.4, d: 1.4, h: 5, solid: true },
  { key: 'reception', name: 'Reception Desk', w: 8, d: 2.6, h: 3.2, solid: true },
  { key: 'job_desk', name: 'Job Center Desk', w: 8, d: 2.6, h: 3.2, solid: true, interact: 'jobdesk' },
  { key: 'police_desk', name: 'Desk', w: 5, d: 2.4, h: 2.6, solid: true },
  { key: 'bars', name: 'Cell Bars', w: 10, d: 0.5, h: 8.5, solid: true },
  { key: 'locker', name: 'Uniform Locker', w: 4, d: 1.6, h: 7, solid: true, interact: 'locker' },
  { key: 'jail_desk', name: 'Booking Desk', w: 5, d: 2.4, h: 3.2, solid: true, interact: 'jail' },
  { key: 'atm', name: 'ATM', w: 2.2, d: 1.6, h: 5, solid: true, interact: 'atm' },
  { key: 'vending', name: 'Vending Machine', w: 2.6, d: 2, h: 5.6, solid: true, interact: 'vending' },
  { key: 'gas_pump', name: 'Gas Pump', w: 2.4, d: 1.6, h: 5, solid: true, interact: 'pump' },
  { key: 'display_pad', name: 'Display Turntable', w: 12, d: 12, h: 0.4, solid: false },
  { key: 'dealer_desk', name: 'Sales Desk', w: 5, d: 2.4, h: 3, solid: true, interact: 'dealer' },
  { key: 'depot_desk', name: 'Dispatch Counter', w: 8, d: 2.6, h: 3.2, solid: true, interact: 'depot' },
  { key: 'crate_stack', name: 'Parcels', w: 4, d: 4, h: 4.4, solid: true },
  { key: 'pallet', name: 'Pallet of Boxes', w: 4, d: 4, h: 3, solid: true },
  { key: 'hangar_desk', name: 'Flight Desk', w: 5, d: 2.4, h: 3.2, solid: true, interact: 'hangar' },
  { key: 'boat_kiosk', name: 'Boat Rentals', w: 5, d: 4, h: 6, solid: true, interact: 'boats' },
  { key: 'fire_pole', name: 'Fire Pole', w: 0.6, d: 0.6, h: 9, solid: true },
  { key: 'treadmill', name: 'Treadmill', w: 2.4, d: 5, h: 3.6, solid: true },
  // -------------------------------------------------------- street & parks
  { key: 'bench', name: 'Bench', w: 5, d: 2, h: 2.6, solid: true, seats: [s(-1.2, 1.2, 0.1), s(1.2, 1.2, 0.1)] },
  { key: 'picnic_table', name: 'Picnic Table', w: 5, d: 5.2, h: 2.2, solid: true, seats: [s(-1.2, 1.2, -1.9), s(1.2, 1.2, -1.9), s(-1.2, 1.2, 1.9, Math.PI), s(1.2, 1.2, 1.9, Math.PI)] },
  { key: 'bus_stop', name: 'Bus Stop', w: 9, d: 3.4, h: 6.4, solid: false, seats: [s(-2, 1.2, -0.6), s(0, 1.2, -0.6), s(2, 1.2, -0.6)] },
  { key: 'trash_bin', name: 'Trash Can', w: 1.4, d: 1.4, h: 2.6, solid: true },
  { key: 'hydrant', name: 'Fire Hydrant', w: 0.9, d: 0.9, h: 1.8, solid: true },
  { key: 'planter', name: 'Planter', w: 3.4, d: 3.4, h: 1.2, solid: true },
  { key: 'fountain', name: 'Fountain', w: 16, d: 16, h: 1.4, solid: true },
  { key: 'statue', name: 'Statue', w: 4, d: 4, h: 12, solid: true, core: 4 },
  { key: 'lifeguard_tower', name: 'Lifeguard Tower', w: 6, d: 6, h: 10, solid: true },
  { key: 'beach_umbrella', name: 'Beach Umbrella', w: 6, d: 6, h: 6.4, solid: false },
  { key: 'beach_towel', name: 'Beach Towel', w: 2.4, d: 5, h: 0.06, solid: false, seats: [s(0, 0.12, 0, 0, 'lie')] },
  { key: 'volleyball_net', name: 'Volleyball Net', w: 20, d: 1, h: 6, solid: false },
  { key: 'swings', name: 'Swing Set', w: 10, d: 4, h: 7, solid: false, seats: [s(-2.2, 1.5, 0, 0, 'swing'), s(2.2, 1.5, 0, 0, 'swing')] },
  { key: 'slide', name: 'Slide', w: 3, d: 10, h: 7, solid: true },
  { key: 'seesaw', name: 'Seesaw', w: 1.6, d: 10, h: 2.2, solid: false, seats: [s(0, 1.6, -3.8, 0, 'ride'), s(0, 1.6, 3.8, Math.PI, 'ride')] },
  { key: 'hoop', name: 'Basketball Hoop', w: 2, d: 4, h: 11, solid: true, core: 1 },
  { key: 'bush', name: 'Hibiscus Bush', w: 3, d: 3, h: 2.6, solid: true },
  { key: 'hedge', name: 'Hedge', w: 8, d: 2, h: 2.6, solid: true },
  { key: 'fence', name: 'Picket Fence', w: 8, d: 0.4, h: 2, solid: true },
  { key: 'mailbox', name: 'Mailbox', w: 0.8, d: 1, h: 2.8, solid: true },
  { key: 'parking_meter', name: 'Parking Meter', w: 0.6, d: 0.6, h: 3, solid: true },
  { key: 'dock_post', name: 'Dock Post', w: 0.8, d: 0.8, h: 2, solid: true },
  { key: 'buoy', name: 'Buoy', w: 1.6, d: 1.6, h: 2.6, solid: false },
  { key: 'cone', name: 'Traffic Cone', w: 0.9, d: 0.9, h: 1.4, solid: false },
];

export const PROPS: readonly PropDef[] = RAW.map((def, i) => ({ ...def, id: i + 1 }));

export type PropKey = string;

const BY_KEY = new Map<string, PropDef>(PROPS.map((p) => [p.key, p]));
const BY_ID = new Map<number, PropDef>(PROPS.map((p) => [p.id, p]));

export const propByKey = (key: string): PropDef => {
  const def = BY_KEY.get(key);
  if (!def) throw new Error(`unknown prop ${key}`);
  return def;
};

export const propById = (id: number): PropDef | undefined => BY_ID.get(id);

/** Everything the furniture store sells, cheapest first within each category. */
export const FURNITURE: readonly PropDef[] = PROPS.filter((p) => p.furniture).sort((a, b) => a.furniture!.price - b.furniture!.price);

/** A prop placed in the world (or in a house, in house-local coordinates). */
export interface PropPlacement {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Yaw: the prop's local +z ends up facing (sin rot, cos rot). */
  readonly rot: number;
}

/** Rotate a local offset by a yaw (three.js convention: +z rotated by `rot` is (sin, cos)). */
export const rotateXZ = (x: number, z: number, rot: number): { x: number; z: number } => {
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  return { x: x * c + z * sn, z: -x * sn + z * c };
};

/** The world-space footprint (AABB) of a prop, for collision and overlap tests. */
export const propFootprint = (def: PropDef, p: { x: number; z: number; rot: number }): { minX: number; maxX: number; minZ: number; maxZ: number } => {
  const hw = (def.core ?? def.w) / 2;
  const hd = (def.core ?? def.d) / 2;
  const c = Math.abs(Math.cos(p.rot));
  const sn = Math.abs(Math.sin(p.rot));
  const ex = hw * c + hd * sn;
  const ez = hw * sn + hd * c;
  return { minX: p.x - ex, maxX: p.x + ex, minZ: p.z - ez, maxZ: p.z + ez };
};
