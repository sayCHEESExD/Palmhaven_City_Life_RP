/**
 * THINGS YOU CARRY AND THINGS YOU WEAR.
 *
 *   - ITEMS go in the hotbar and in your hand: snacks and drinks you eat,
 *     lifestyle props you show off (a surfboard, a guitar, a camera).
 *     Food is used up; everything else is kept for good.
 *   - ACCESSORIES are worn over your Bloxity avatar: a hat, something on the
 *     face, something on the back. Job uniforms add their own hat while on duty.
 */

export type ItemUse = 'eat' | 'drink' | 'hold' | 'strum' | 'photo' | 'wave' | 'fish' | 'party';

export interface ItemDef {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly price: number;
  readonly use: ItemUse;
  /** Eaten or drunk: one use each. */
  readonly consumable: boolean;
  readonly blurb: string;
}

const RAW: readonly Omit<ItemDef, 'id'>[] = [
  { key: 'burger', name: 'Palm Burger', price: 12, use: 'eat', consumable: true, blurb: 'The house classic.' },
  { key: 'fries', name: 'Fries', price: 6, use: 'eat', consumable: true, blurb: 'Salty and golden.' },
  { key: 'hotdog', name: 'Hot Dog', price: 8, use: 'eat', consumable: true, blurb: 'Boardwalk style.' },
  { key: 'pizza', name: 'Pizza Slice', price: 7, use: 'eat', consumable: true, blurb: 'Pepperoni, obviously.' },
  { key: 'taco', name: 'Fish Taco', price: 9, use: 'eat', consumable: true, blurb: 'Fresh from the coast.' },
  { key: 'donut', name: 'Sprinkle Donut', price: 4, use: 'eat', consumable: true, blurb: 'Pink frosting.' },
  { key: 'croissant', name: 'Croissant', price: 5, use: 'eat', consumable: true, blurb: 'Flaky and warm.' },
  { key: 'sandwich', name: 'Cuban Sandwich', price: 10, use: 'eat', consumable: true, blurb: 'Pressed and perfect.' },
  { key: 'icecream', name: 'Ice Cream Cone', price: 5, use: 'eat', consumable: true, blurb: 'Melts fast in the sun.' },
  { key: 'watermelon', name: 'Watermelon Slice', price: 3, use: 'eat', consumable: true, blurb: 'Beach picnic essential.' },
  { key: 'coffee', name: 'Cafecito', price: 4, use: 'drink', consumable: true, blurb: 'Strong, sweet, tiny.' },
  { key: 'soda', name: 'Soda', price: 3, use: 'drink', consumable: true, blurb: 'Fizzy and cold.' },
  { key: 'smoothie', name: 'Mango Smoothie', price: 7, use: 'drink', consumable: true, blurb: 'Tropical blend.' },
  { key: 'coconut', name: 'Coconut Drink', price: 8, use: 'drink', consumable: true, blurb: 'With a little umbrella.' },
  { key: 'surfboard', name: 'Surfboard', price: 450, use: 'hold', consumable: false, blurb: 'Catch a wave.' },
  { key: 'guitar', name: 'Guitar', price: 600, use: 'strum', consumable: false, blurb: 'Play for the beach crowd.' },
  { key: 'camera', name: 'Camera', price: 350, use: 'photo', consumable: false, blurb: 'Say cheese!' },
  { key: 'bouquet', name: 'Flowers', price: 40, use: 'hold', consumable: false, blurb: 'For someone special.' },
  { key: 'balloon', name: 'Balloon', price: 15, use: 'hold', consumable: false, blurb: 'Bobbing on a string.' },
  { key: 'umbrella', name: 'Umbrella', price: 60, use: 'hold', consumable: false, blurb: 'Sun or rain.' },
  { key: 'boombox', name: 'Boombox', price: 800, use: 'party', consumable: false, blurb: 'Bring the party.' },
  { key: 'briefcase', name: 'Briefcase', price: 120, use: 'hold', consumable: false, blurb: 'Very important business.' },
  { key: 'beachball', name: 'Beach Ball', price: 30, use: 'hold', consumable: false, blurb: 'Bounce bounce.' },
  { key: 'fishing_rod', name: 'Fishing Rod', price: 250, use: 'fish', consumable: false, blurb: 'Cast off a pier for a catch.' },
  { key: 'sign', name: 'Protest Sign', price: 20, use: 'wave', consumable: false, blurb: 'Make your voice heard.' },
  // Job gear: never sold, held automatically.
  { key: 'parcel', name: 'Parcel', price: 0, use: 'hold', consumable: false, blurb: 'Deliver it to the address.' },
  { key: 'medkit', name: 'Med Kit', price: 0, use: 'hold', consumable: false, blurb: 'Treat a patient.' },
  { key: 'tray', name: 'Order Tray', price: 0, use: 'hold', consumable: false, blurb: 'Serve it at the register.' },
];

export const ITEMS: readonly ItemDef[] = RAW.map((def, i) => ({ ...def, id: i + 1 }));
const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
const ITEM_BY_KEY = new Map(ITEMS.map((i) => [i.key, i]));
export const itemById = (id: number): ItemDef | undefined => ITEM_BY_ID.get(id);
export const itemByKey = (key: string): ItemDef => {
  const def = ITEM_BY_KEY.get(key);
  if (!def) throw new Error(`unknown item ${key}`);
  return def;
};

/** Most of one item in the bag. */
export const MAX_STACK = 20;

export type AccessorySlot = 'hat' | 'face' | 'back';

export interface AccessoryDef {
  readonly id: number;
  readonly key: string;
  readonly name: string;
  readonly slot: AccessorySlot;
  readonly price: number;
  readonly color: number;
  /** Uniform only, never sold. */
  readonly uniform?: boolean;
}

const ACC: readonly Omit<AccessoryDef, 'id'>[] = [
  { key: 'cap_red', name: 'Red Cap', slot: 'hat', price: 60, color: 0xe03c3c },
  { key: 'cap_teal', name: 'Teal Cap', slot: 'hat', price: 60, color: 0x2ec4b6 },
  { key: 'sunhat', name: 'Sun Hat', slot: 'hat', price: 120, color: 0xf3dfa2 },
  { key: 'bucket_hat', name: 'Bucket Hat', slot: 'hat', price: 90, color: 0xff9f1c },
  { key: 'beanie', name: 'Beanie', slot: 'hat', price: 70, color: 0xd7263d },
  { key: 'cowboy', name: 'Cowboy Hat', slot: 'hat', price: 220, color: 0x8b5a2b },
  { key: 'fedora', name: 'Panama Hat', slot: 'hat', price: 260, color: 0xefe6d0 },
  { key: 'headphones', name: 'Headphones', slot: 'hat', price: 300, color: 0x222831 },
  { key: 'flower_crown', name: 'Flower Crown', slot: 'hat', price: 180, color: 0xff70a6 },
  { key: 'crown', name: 'Gold Crown', slot: 'hat', price: 25000, color: 0xffcf33 },
  { key: 'sunglasses', name: 'Sunglasses', slot: 'face', price: 80, color: 0x111111 },
  { key: 'aviators', name: 'Aviators', slot: 'face', price: 240, color: 0xc9a227 },
  { key: 'heart_glasses', name: 'Heart Glasses', slot: 'face', price: 150, color: 0xff3d7f },
  { key: 'mustache', name: 'Mustache', slot: 'face', price: 50, color: 0x3b2a1a },
  { key: 'backpack', name: 'Backpack', slot: 'back', price: 140, color: 0x3a86ff },
  { key: 'surf_back', name: 'Surfboard (worn)', slot: 'back', price: 400, color: 0x00bbf9 },
  { key: 'guitar_back', name: 'Guitar (worn)', slot: 'back', price: 450, color: 0xb5651d },
  { key: 'wings', name: 'Angel Wings', slot: 'back', price: 12000, color: 0xffffff },
  { key: 'lei', name: 'Flower Lei', slot: 'back', price: 60, color: 0xff6f91 },
  // Uniforms.
  { key: 'police_cap', name: 'Police Cap', slot: 'hat', price: 0, color: 0x1d2b4f, uniform: true },
  { key: 'medic_cap', name: 'Medic Cap', slot: 'hat', price: 0, color: 0xffffff, uniform: true },
  { key: 'delivery_cap', name: 'PalmPost Cap', slot: 'hat', price: 0, color: 0xffb547, uniform: true },
  { key: 'taxi_cap', name: 'Taxi Cap', slot: 'hat', price: 0, color: 0xffd23f, uniform: true },
  { key: 'chef_hat', name: 'Chef Hat', slot: 'hat', price: 0, color: 0xffffff, uniform: true },
  { key: 'visor', name: 'Shop Visor', slot: 'hat', price: 0, color: 0x2ecc71, uniform: true },
];

export const ACCESSORIES: readonly AccessoryDef[] = ACC.map((def, i) => ({ ...def, id: i + 1 }));
const ACC_BY_ID = new Map(ACCESSORIES.map((a) => [a.id, a]));
const ACC_BY_KEY = new Map(ACCESSORIES.map((a) => [a.key, a]));
export const accessoryById = (id: number): AccessoryDef | undefined => ACC_BY_ID.get(id);
export const accessoryByKey = (key: string): AccessoryDef => {
  const def = ACC_BY_KEY.get(key);
  if (!def) throw new Error(`unknown accessory ${key}`);
  return def;
};
