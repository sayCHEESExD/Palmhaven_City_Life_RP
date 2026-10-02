/**
 * WHAT IS INSIDE each enterable building, in the building's LOCAL frame:
 * origin at its centre, the front door on the +z wall, x across. The city
 * assembly rotates these into the world, so one layout serves every building
 * of its kind whichever way it faces.
 *
 * Everything with collision, a seat or an interaction lives here; the client
 * adds purely decorative touches (wall art, ceiling lights) on its own.
 */

export type InteriorKind =
  | 'clothing'
  | 'grocery'
  | 'furniture'
  | 'cafe'
  | 'burger'
  | 'dealer'
  | 'police'
  | 'hospital'
  | 'fire'
  | 'cityhall'
  | 'bank'
  | 'gasmart'
  | 'depot'
  | 'hangar'
  | 'terminal'
  | 'home';

export type FloorKind = 'tile' | 'wood' | 'marble' | 'concrete' | 'checker' | 'carpet' | 'terrazzo';

export interface LocalProp {
  readonly key: string;
  readonly x: number;
  readonly z: number;
  readonly rot?: number;
  /** A name for the interaction prompt, overriding the prop's own. */
  readonly label?: string;
  /** A static vehicle on display (dealer pads, fire trucks, the hangar plane). */
  readonly vehicle?: string;
}

export interface LocalWall {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  readonly h?: number;
}

export interface InteriorLayout {
  readonly props: readonly LocalProp[];
  readonly walls?: readonly LocalWall[];
  /** Named points: jail cells, where customers queue. */
  readonly spots?: Readonly<Record<string, readonly { x: number; z: number }[]>>;
  readonly floor: FloorKind;
  readonly wall: number;
  /** Static display vehicles (no collision beyond their pad). */
  readonly displays?: readonly LocalProp[];
}

const H = Math.PI / 2;
const P = Math.PI;

const tableFor2 = (x: number, z: number): LocalProp[] => [
  { key: 'cafe_table', x, z },
  { key: 'chair', x: x - 2.3, z, rot: H },
  { key: 'chair', x: x + 2.3, z, rot: -H },
];

const diningSet = (x: number, z: number): LocalProp[] => [
  { key: 'dining_table', x, z },
  { key: 'chair', x: x - 1.3, z: z - 2.4 },
  { key: 'chair', x: x + 1.3, z: z - 2.4 },
  { key: 'chair', x: x - 1.3, z: z + 2.4, rot: P },
  { key: 'chair', x: x + 1.3, z: z + 2.4, rot: P },
];

/** A layout for a building of this size. Sizes are the ones `buildings.ts` uses for each kind. */
export const interiorLayout = (kind: InteriorKind, w: number, d: number): InteriorLayout => {
  const hw = w / 2;
  const hd = d / 2;
  const back = -hd + 0.8;
  switch (kind) {
    case 'clothing':
      return {
        floor: 'terrazzo',
        wall: 0xfde4ec,
        props: [
          { key: 'counter', x: -7.5, z: back + 4.4, label: 'Coastline Threads' },
          { key: 'locker', x: -hw + 1.8, z: back + 3, rot: H, label: 'Clerk Locker' },
          { key: 'mirror', x: hw - 1.1, z: -4, rot: -H, label: 'Fitting Mirror' },
          { key: 'mirror', x: hw - 1.1, z: 4, rot: -H, label: 'Fitting Mirror' },
          { key: 'clothes_rack', x: -3, z: -2 },
          { key: 'clothes_rack', x: 7, z: -2 },
          { key: 'clothes_rack', x: -3, z: 5 },
          { key: 'clothes_rack', x: 7, z: 5 },
          { key: 'mannequin', x: -11, z: hd - 3.5 },
          { key: 'mannequin', x: 11, z: hd - 3.5 },
          { key: 'plant', x: -hw + 2, z: hd - 2.4 },
          { key: 'plant', x: hw - 2, z: hd - 2.4 },
          { key: 'armchair', x: hw - 3, z: back + 2.6, rot: -3 * Math.PI / 4 },
        ],
        spots: { customer: [{ x: -7.5, z: back + 7.4 }] },
      };
    case 'grocery':
      return {
        floor: 'tile',
        wall: 0xe8f7ee,
        props: [
          ...[-16, -9, -2].flatMap((x) => [-6, 4].map((z): LocalProp => ({ key: 'shelf', x, z, rot: H }))),
          { key: 'cooler', x: -14, z: back + 1.4 },
          { key: 'cooler', x: -7.5, z: back + 1.4 },
          { key: 'cooler', x: -1, z: back + 1.4 },
          { key: 'counter', x: 12, z: -1, label: 'FreshMart Checkout' },
          { key: 'locker', x: hw - 1.8, z: back + 3, rot: -H, label: 'Clerk Locker' },
          { key: 'plant', x: hw - 2, z: hd - 2.4 },
          { key: 'vending', x: -hw + 1.8, z: hd - 3, rot: H },
        ],
        spots: { customer: [{ x: 12, z: 2.4 }] },
      };
    case 'furniture':
      return {
        floor: 'wood',
        wall: 0xf3eadf,
        props: [
          { key: 'rug', x: -10, z: 3.5 },
          { key: 'tv', x: -10, z: -1.4 },
          { key: 'coffee_table', x: -10, z: 3 },
          { key: 'sofa', x: -10, z: 7, rot: P },
          { key: 'floor_lamp', x: -15, z: 7 },
          { key: 'bed', x: 10, z: -7 },
          { key: 'dresser', x: 16, z: back + 1.2 },
          { key: 'floor_lamp', x: 5, z: back + 1.4 },
          ...diningSet(10, 7),
          { key: 'counter', x: -11, z: back + 2.2, label: 'Casa Home' },
          { key: 'aquarium', x: 1, z: back + 1.2 },
          { key: 'plant', x: -hw + 2, z: hd - 2.4 },
          { key: 'plant', x: hw - 2, z: hd - 2.4 },
          { key: 'piano', x: 1, z: 6 },
        ],
      };
    case 'cafe':
      return {
        floor: 'checker',
        wall: 0xfff1dc,
        props: [
          { key: 'counter', x: -2, z: -3.4, label: 'Sunset Cafe' },
          { key: 'coffee_machine', x: -6, z: back + 1.4 },
          { key: 'display_case', x: 0, z: back + 1.4 },
          { key: 'soda_fountain', x: 6, z: back + 1.4 },
          { key: 'locker', x: hw - 1.8, z: back + 2.6, rot: -H, label: 'Cook Locker' },
          ...tableFor2(-8, 4),
          ...tableFor2(1, 6.5),
          ...tableFor2(9, 3.5),
          { key: 'plant', x: -hw + 2, z: hd - 2.2 },
          { key: 'bar_stool', x: -6.6, z: -0.6 },
          { key: 'bar_stool', x: -4.6, z: -0.6 },
        ],
        spots: { customer: [{ x: -2, z: 0 }] },
      };
    case 'burger':
      return {
        floor: 'checker',
        wall: 0xffe3e3,
        props: [
          { key: 'counter', x: -4, z: -2.4, label: 'Palm Burger' },
          { key: 'grill', x: -10, z: back + 1.4 },
          { key: 'fryer', x: -4, z: back + 1.4 },
          { key: 'soda_fountain', x: 2, z: back + 1.4 },
          { key: 'locker', x: hw - 1.8, z: back + 2.6, rot: -H, label: 'Cook Locker' },
          { key: 'booth', x: -11, z: 7.4, rot: H },
          { key: 'booth', x: 0, z: 7.4, rot: H },
          { key: 'booth', x: 11, z: 7.4, rot: H },
          { key: 'booth', x: 12.5, z: -3.5, rot: H },
          { key: 'vending', x: -hw + 1.8, z: 0, rot: H },
        ],
        spots: { customer: [{ x: -4, z: 1 }] },
      };
    case 'dealer':
      return {
        floor: 'marble',
        wall: 0xeef3f8,
        props: [
          { key: 'display_pad', x: -11, z: 3 },
          { key: 'display_pad', x: 11, z: 3 },
          { key: 'dealer_desk', x: 0, z: back + 3.4, label: 'Palm Motors Sales' },
          { key: 'chair', x: -1.6, z: back + 6.2, rot: P },
          { key: 'chair', x: 1.6, z: back + 6.2, rot: P },
          { key: 'office_chair', x: 0, z: back + 1.2 },
          { key: 'plant', x: -hw + 2, z: back + 2 },
          { key: 'plant', x: hw - 2, z: back + 2 },
          { key: 'sofa', x: -hw + 2, z: -6, rot: H },
        ],
        displays: [
          { key: 'display', x: -11, z: 3, rot: 0.6, vehicle: 'sports' },
          { key: 'display', x: 11, z: 3, rot: -0.6, vehicle: 'luxury' },
        ],
      };
    case 'police':
      return {
        floor: 'tile',
        wall: 0xdfe7f2,
        props: [
          { key: 'reception', x: 0, z: 8 },
          { key: 'locker', x: -hw + 1.8, z: -2, rot: H, label: 'Police Locker' },
          { key: 'locker', x: -hw + 1.8, z: 3, rot: H, label: 'Police Locker' },
          { key: 'jail_desk', x: 12, z: -6, label: 'Booking Desk' },
          { key: 'police_desk', x: -16, z: 8 },
          { key: 'office_chair', x: -16, z: 5.6, rot: P },
          { key: 'police_desk', x: 18, z: 8 },
          { key: 'office_chair', x: 18, z: 5.6, rot: P },
          { key: 'bars', x: -10, z: -12 },
          { key: 'bars', x: 0, z: -12 },
          { key: 'bars', x: 10, z: -12 },
          { key: 'bench', x: -10, z: back + 1.4 },
          { key: 'bench', x: 0, z: back + 1.4 },
          { key: 'bench', x: 10, z: back + 1.4 },
          { key: 'vending', x: hw - 1.8, z: 14, rot: -H },
          { key: 'plant', x: -hw + 2, z: hd - 2.4 },
        ],
        walls: [
          { x0: -15.3, z0: back, x1: -14.7, z1: -12 },
          { x0: -5.3, z0: back, x1: -4.7, z1: -12 },
          { x0: 4.7, z0: back, x1: 5.3, z1: -12 },
          { x0: 14.7, z0: back, x1: 15.3, z1: -12 },
        ],
        spots: { cells: [{ x: -10, z: -16 }, { x: 0, z: -16 }, { x: 10, z: -16 }] },
      };
    case 'hospital':
      return {
        floor: 'tile',
        wall: 0xeaf6f8,
        props: [
          { key: 'reception', x: -20, z: 10, label: 'Reception' },
          { key: 'locker', x: -hw + 1.8, z: -2, rot: H, label: 'Medic Locker' },
          ...[-10, -7.6, -5.2, -2.8].map((x): LocalProp => ({ key: 'chair', x, z: 15, rot: P })),
          ...[2, 10, 18, 26, 34].flatMap((x): LocalProp[] => [
            { key: 'hospital_bed', x, z: back + 3.4 },
            { key: 'monitor', x: x + 2.6, z: back + 1.4 },
          ]),
          { key: 'vending', x: -hw + 1.8, z: 14, rot: H },
          { key: 'plant', x: -6, z: back + 1.4 },
          { key: 'plant', x: hw - 2, z: hd - 2.4 },
        ],
        walls: [{ x0: -2, z0: -6.3, x1: hw - 0.8, z1: -5.7, h: 4 }],
      };
    case 'fire':
      return {
        floor: 'concrete',
        wall: 0xf3dfd8,
        props: [
          { key: 'locker', x: hw - 1.8, z: -8, rot: -H, label: 'Gear Locker' },
          { key: 'locker', x: hw - 1.8, z: -2, rot: -H, label: 'Gear Locker' },
          { key: 'fire_pole', x: 18, z: back + 4 },
          { key: 'bench', x: 18, z: 6, rot: -H },
          { key: 'kitchen_counter', x: -18, z: back + 1.2 },
          { key: 'fridge', x: -22.6, z: back + 1.2 },
        ],
        displays: [
          { key: 'display', x: -14, z: -1, vehicle: 'firetruck' },
          { key: 'display', x: 0, z: -1, vehicle: 'firetruck' },
        ],
      };
    case 'cityhall':
      return {
        floor: 'marble',
        wall: 0xf5f0e6,
        props: [
          { key: 'job_desk', x: 0, z: -8, label: 'Job Center' },
          { key: 'atm', x: -hw + 1.6, z: -6, rot: H },
          { key: 'atm', x: -hw + 1.6, z: 0, rot: H },
          { key: 'mirror', x: hw - 1.1, z: -5, rot: -H, label: 'Wardrobe Mirror' },
          { key: 'bench', x: -12, z: 6, rot: P },
          { key: 'bench', x: 12, z: 6, rot: P },
          { key: 'plant', x: -hw + 2, z: hd - 2.4 },
          { key: 'plant', x: hw - 2, z: hd - 2.4 },
          { key: 'plant', x: -6, z: back + 1.4 },
          { key: 'plant', x: 6, z: back + 1.4 },
          { key: 'statue', x: 0, z: back + 2.6 },
        ],
      };
    case 'bank':
      return {
        floor: 'marble',
        wall: 0xeef1e4,
        props: [
          { key: 'reception', x: 2, z: -5.5 },
          { key: 'atm', x: -hw + 1.6, z: -6, rot: H },
          { key: 'atm', x: -hw + 1.6, z: 0, rot: H },
          { key: 'atm', x: -hw + 1.6, z: 6, rot: H },
          { key: 'bench', x: 8, z: 6, rot: P },
          { key: 'plant', x: hw - 2, z: hd - 2.4 },
        ],
      };
    case 'gasmart':
      return {
        floor: 'tile',
        wall: 0xfff6d6,
        props: [
          { key: 'counter', x: -4.5, z: -4.6, label: 'Sun Fuel Mart' },
          { key: 'shelf', x: 4.5, z: 0.5, rot: H },
          { key: 'cooler', x: 4.5, z: back + 1.4 },
        ],
      };
    case 'depot':
      return {
        floor: 'concrete',
        wall: 0xe9e2d4,
        props: [
          { key: 'depot_desk', x: -12, z: -4, label: 'PalmPost Dispatch' },
          { key: 'crate_stack', x: 8, z: back + 2.4 },
          { key: 'crate_stack', x: 13, z: back + 2.4 },
          { key: 'crate_stack', x: 18, z: back + 2.4 },
          { key: 'pallet', x: 8, z: -6 },
          { key: 'pallet', x: 18, z: -4 },
          { key: 'pallet', x: -20, z: back + 2.4 },
          { key: 'vending', x: -hw + 1.8, z: 10, rot: H },
        ],
      };
    case 'hangar':
      return {
        floor: 'concrete',
        wall: 0xdde3ea,
        props: [
          { key: 'hangar_desk', x: -15, z: back + 3, label: 'Hangar Desk' },
          { key: 'pallet', x: 16, z: back + 2.4 },
        ],
        displays: [{ key: 'display', x: 5, z: -2, rot: 0.3, vehicle: 'plane' }],
      };
    case 'terminal':
      return {
        floor: 'terrazzo',
        wall: 0xf1f4f7,
        props: [
          { key: 'reception', x: -40, z: -18, label: 'Check-in' },
          { key: 'reception', x: -24, z: -18, label: 'Check-in' },
          { key: 'hangar_desk', x: 24, z: -18, label: 'Flight Desk' },
          ...[-12, -9.6, -7.2, -4.8, 4.8, 7.2, 9.6, 12].flatMap((x): LocalProp[] => [
            { key: 'chair', x, z: 2 },
            { key: 'chair', x, z: 6.4, rot: P },
          ]),
          { key: 'vending', x: hw - 1.8, z: 4, rot: -H },
          { key: 'vending', x: hw - 1.8, z: 8, rot: -H },
          { key: 'plant', x: -hw + 2, z: hd - 2.4 },
          { key: 'plant', x: hw - 2, z: hd - 2.4 },
        ],
      };
    case 'home':
      return { floor: 'wood', wall: 0xfaf3e8, props: [] };
  }
};

/** Where a door is on a building of this kind (offset along local x), and how wide. */
export const doorsOf = (kind: InteriorKind, w: number): { offset: number; width: number; height: number }[] => {
  switch (kind) {
    case 'fire':
      return [-14, 0, 14].map((offset) => ({ offset, width: 11, height: 9.2 }));
    case 'depot':
      return [{ offset: 6, width: 10, height: 8.6 }];
    case 'hangar':
      return [{ offset: 0, width: Math.min(32, w - 8), height: 9.6 }];
    case 'terminal':
      return [-28, 28].map((offset) => ({ offset, width: 7, height: 7.4 }));
    case 'home':
      return [{ offset: 0, width: 4.2, height: 7 }];
    case 'police':
    case 'hospital':
    case 'cityhall':
      return [{ offset: 0, width: 7, height: 7.6 }];
    default:
      return [{ offset: 0, width: 5.2, height: 7.2 }];
  }
};

/** Inside height of every enterable building's ground floor. */
export const INTERIOR_HEIGHT = 10;
/** Wall thickness of enterable buildings. */
export const WALL = 0.8;
