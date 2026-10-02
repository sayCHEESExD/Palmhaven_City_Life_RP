import { ACCESSORIES, ITEMS, itemByKey } from './items.js';
import { FURNITURE } from '../world/props.js';
import { VEHICLES } from './vehicles.js';

/**
 * EVERY COUNTER IN TOWN, through one shop window. A shop sells one kind of
 * thing (vehicles, accessories, items or furniture) from a stock list; the
 * restaurants and stores can also be STAFFED by a player on the matching job.
 */
export type ShopId = 'dealer' | 'clothing' | 'grocery' | 'cafe' | 'burger' | 'furniture' | 'gas' | 'vending';

export type ShopKind = 'vehicles' | 'accessories' | 'items' | 'furniture';

export interface ShopDef {
  readonly id: ShopId;
  readonly name: string;
  readonly kind: ShopKind;
  readonly stock: readonly number[];
  readonly tagline: string;
  readonly color: string;
  /** The job that staffs this shop's register. */
  readonly worker?: 'chef' | 'clerk';
  /** For kitchens: the station prop that makes each item. */
  readonly stations?: Readonly<Record<string, string>>;
}

const items = (...keys: string[]): number[] => keys.map((k) => itemByKey(k).id);

export const SHOPS: Readonly<Record<ShopId, ShopDef>> = {
  dealer: {
    id: 'dealer', name: 'Palm Motors', kind: 'vehicles', color: '#3aa0ff', tagline: 'Drive away today!',
    stock: VEHICLES.filter((v) => v.price > 0 && !v.hidden).map((v) => v.id),
  },
  clothing: {
    id: 'clothing', name: 'Coastline Threads', kind: 'accessories', color: '#ff70a6', tagline: 'Look good, feel good.', worker: 'clerk',
    stock: ACCESSORIES.filter((a) => !a.uniform).map((a) => a.id),
  },
  grocery: {
    id: 'grocery', name: 'FreshMart', kind: 'items', color: '#3ecf8e', tagline: 'Everything for the beach.', worker: 'clerk',
    stock: items('soda', 'watermelon', 'icecream', 'sandwich', 'coconut', 'donut', 'beachball', 'balloon', 'bouquet', 'umbrella', 'sign', 'camera', 'fishing_rod', 'surfboard', 'guitar', 'boombox', 'briefcase'),
  },
  cafe: {
    id: 'cafe', name: 'Sunset Cafe', kind: 'items', color: '#ff9f43', tagline: 'Cafecito & sweet treats.', worker: 'chef',
    stock: items('coffee', 'croissant', 'donut', 'smoothie', 'sandwich'),
    stations: { coffee: 'coffee_machine', croissant: 'display_case', donut: 'display_case', smoothie: 'soda_fountain', sandwich: 'display_case' },
  },
  burger: {
    id: 'burger', name: 'Palm Burger', kind: 'items', color: '#ff4757', tagline: 'Flame grilled since 1958.', worker: 'chef',
    stock: items('burger', 'fries', 'hotdog', 'soda', 'icecream'),
    stations: { burger: 'grill', hotdog: 'grill', fries: 'fryer', soda: 'soda_fountain', icecream: 'soda_fountain' },
  },
  furniture: {
    id: 'furniture', name: 'Casa Home', kind: 'furniture', color: '#c08bff', tagline: 'Make it yours.',
    stock: FURNITURE.map((f) => f.id),
  },
  gas: {
    id: 'gas', name: 'Sun Fuel Mart', kind: 'items', color: '#ffd23f', tagline: 'Fuel up, snack up.',
    stock: items('soda', 'hotdog', 'pizza', 'taco', 'coffee', 'donut'),
  },
  vending: {
    id: 'vending', name: 'Vending Machine', kind: 'items', color: '#9aa5b1', tagline: 'Insert coins.',
    stock: items('soda', 'coconut'),
  },
};

export const SHOP_IDS = Object.keys(SHOPS) as ShopId[];
export const isShopId = (id: unknown): id is ShopId => typeof id === 'string' && id in SHOPS;

/** Item ids every shop sells, for validation. */
export const shopSells = (shop: ShopId, id: number): boolean => SHOPS[shop].stock.includes(id);

/** Staffed shops: how many items a customer orders. */
export const ORDER_SIZE = { min: 1, max: 3 } as const;

/** Every item that exists, for lookups that do not care which shop. */
export const ALL_ITEMS = ITEMS;
