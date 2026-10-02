import type { PropPlacement } from './props.js';

/**
 * HOMES. Buying a style is for keeps (it is saved on your profile); in each
 * server you then MOVE INTO any free home of a style you own. Furniture is
 * saved per style in house-local coordinates, so your living room comes with
 * you to whichever townhouse or villa you move into.
 */

export type HouseStyle = 'townhouse' | 'bungalow' | 'family' | 'villa';

export interface HouseStyleDef {
  readonly id: HouseStyle;
  readonly index: number;
  readonly name: string;
  readonly price: number;
  readonly blurb: string;
  /** Building size: w across the front, d deep, wall height. */
  readonly w: number;
  readonly d: number;
  readonly h: number;
  readonly floor: 'wood' | 'tile' | 'marble' | 'carpet';
  /** What you move in with. */
  readonly starter: readonly PropPlacement[];
  /** Most furniture pieces. */
  readonly capacity: number;
}

const P = Math.PI;
const H = Math.PI / 2;
const f = (key: string, x: number, z: number, rot = 0): PropPlacement => ({ key, x, y: 0, z, rot });

export const HOUSE_STYLES: Readonly<Record<HouseStyle, HouseStyleDef>> = {
  townhouse: {
    id: 'townhouse', index: 0, name: 'Townhouse', price: 0, w: 20, d: 26, h: 13, floor: 'wood', capacity: 30,
    blurb: 'A cozy starter home in a pastel row. Free for every new resident.',
    starter: [
      f('bed', -5.8, -8.4), f('fridge', 0, -11), f('kitchen_counter', 5, -11), f('dining_table', 5, -4.6),
      f('chair', 3.7, -2.3, P), f('chair', 6.3, -2.3, P), f('rug', -0.6, 6, H), f('sofa', -6, 6, H), f('tv', 6.6, 6, -H), f('plant', 7.6, 10.6),
    ],
  },
  bungalow: {
    id: 'bungalow', index: 1, name: 'Beach Bungalow', price: 12000, w: 24, d: 22, h: 11, floor: 'wood', capacity: 40,
    blurb: 'Steps from the sand on the north shore. Wake up to the waves.',
    starter: [
      f('bed', -7.6, -6.4), f('kitchen_counter', 5, -9), f('fridge', 9.6, -9), f('dining_table', 5, -2.6),
      f('chair', 3.7, 0.2, P), f('chair', 6.3, 0.2, P), f('rug', -2, 5, H), f('sofa', -7, 5, H), f('tv', 2.4, 5, -H), f('plant', 9.8, 8.6), f('sun_lounger', 9, 3.6, P),
    ],
  },
  family: {
    id: 'family', index: 2, name: 'Family Home', price: 28000, w: 30, d: 24, h: 14, floor: 'carpet', capacity: 55,
    blurb: 'Room for everyone, a yard and a quiet street.',
    starter: [
      f('bed', -10, -7.4), f('dresser', -4.4, -10), f('kitchen_counter', 5.4, -10), f('stove', 10, -10), f('fridge', 12.8, -10),
      f('dining_table', 7, -2.4), f('chair', 5.7, -4.8), f('chair', 8.3, -4.8), f('chair', 5.7, 0, P), f('chair', 8.3, 0, P),
      f('rug', -4.6, 5.6, H), f('sofa', -10, 5.6, H), f('coffee_table', -6.4, 5.6, H), f('tv', -0.6, 5.6, -H), f('bookshelf', 13, 6, -H), f('plant', 12.8, 10.2),
    ],
  },
  villa: {
    id: 'villa', index: 3, name: 'Waterfront Villa', price: 95000, w: 44, d: 32, h: 16, floor: 'marble', capacity: 80,
    blurb: 'A white villa on the bay with a pool and a private dock.',
    starter: [
      f('bed', -16, -10.6), f('wardrobe', -9.8, -13.6), f('dresser', -20.2, -4, H), f('kitchen_counter', 8, -13.6), f('stove', 12.6, -13.6),
      f('fridge', 15.6, -13.6), f('dining_table', 12, -5), f('chair', 10.7, -7.4), f('chair', 13.3, -7.4), f('chair', 10.7, -2.6, P), f('chair', 13.3, -2.6, P),
      f('sofa_corner', -15, 7), f('coffee_table', -10, 9, H), f('rug', -10, 9), f('tv', -3, 9, -H), f('piano', 13, 8), f('plant', 20, 13), f('plant', -20, 13), f('aquarium', 0, -13.8),
    ],
  },
};

export const HOUSE_STYLE_LIST: readonly HouseStyleDef[] = Object.values(HOUSE_STYLES).sort((a, b) => a.index - b.index);
export const houseStyleByIndex = (index: number): HouseStyleDef | undefined => HOUSE_STYLE_LIST[index];
export const isHouseStyle = (id: unknown): id is HouseStyle => typeof id === 'string' && id in HOUSE_STYLES;

/** Inner furnishable area of a style, in house-local coordinates (door on +z). */
export const furnishArea = (style: HouseStyleDef): { x0: number; z0: number; x1: number; z1: number } => ({
  x0: -style.w / 2 + 0.8,
  z0: -style.d / 2 + 0.8,
  x1: style.w / 2 - 0.8,
  z1: style.d / 2 - 0.8,
});

/** A claimable home in this city. */
export interface HousePlot {
  readonly id: number;
  readonly style: HouseStyle;
  readonly building: number;
  readonly address: string;
  readonly x: number;
  readonly z: number;
  readonly rot: number;
  readonly base: number;
}
