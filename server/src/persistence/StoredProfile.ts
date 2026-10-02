import {
  HOUSE_STYLE_LIST,
  JOBS,
  MAX_MONEY,
  MAX_STACK,
  STARTING_MONEY,
  VEHICLES,
  accessoryById,
  itemById,
  propById,
  type StackItem,
} from '@palmhaven/shared';

/**
 * THE SAVED RESIDENT: everything a session is rebuilt from.
 *
 * Homes are saved as FURNITURE PER STYLE in house-local coordinates, so a
 * returning player's living room is the same whichever townhouse of the row
 * they move into in a new server.
 */
export interface FurnitureRecord {
  kind: number;
  x: number;
  z: number;
  rot: number;
}

export interface StatsRecord {
  deliveries: number;
  fares: number;
  arrests: number;
  treated: number;
  served: number;
  fish: number;
}

export interface ProgressFields {
  money: number;
  earned: number;
  playSeconds: number;
  job: string;
  items: StackItem[];
  held: number;
  accessories: number[];
  wearing: { hat: number; face: number; back: number };
  vehicles: number[];
  /** Owned house style indices. The townhouse is free and always owned. */
  houseStyles: number[];
  /** Furniture layouts by style index; absent = the style's starter set on first move-in. */
  homes: Record<string, FurnitureRecord[]>;
  furniture: StackItem[];
  /** The plot they last lived in, preferred on the next join. */
  lastHouse: number;
  stats: StatsRecord;
  /** Day number of the last ATM bonus. */
  dailyDay: number;
}

export interface ProfileFields extends ProgressFields {
  displayName: string;
  avatarUrl: string;
  updatedAt: number;
}

export interface MigrationFields {
  migratedFrom?: string;
  migratedTo?: string;
  migratedAt?: number;
  migratedSnapshot?: ProgressFields;
}

export type StoredProfile = ProfileFields & MigrationFields & { [field: string]: unknown };

export const CLEARABLE_FIELDS = ['displayName', 'avatarUrl'] as const;

// ------------------------------------------------------------- coercion

const numeric = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
const signed = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const int = (value: unknown, fallback = 0): number => Math.floor(numeric(value, fallback));
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const list = (value: unknown, limit: number): unknown[] => (Array.isArray(value) ? value.slice(0, limit) : []);
const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {});

const stacks = (value: unknown, exists: (id: number) => boolean, max = MAX_STACK): StackItem[] => {
  const byId = new Map<number, number>();
  for (const entry of list(value, 200)) {
    const r = record(entry);
    const id = int(r['id']);
    const count = int(r['count']);
    if (id <= 0 || count <= 0 || !exists(id)) continue;
    byId.set(id, Math.min(max, (byId.get(id) ?? 0) + count));
  }
  return [...byId.entries()].map(([id, count]) => ({ id, count }));
};

const ids = (value: unknown, exists: (id: number) => boolean, limit = 100): number[] => {
  const out = new Set<number>();
  for (const v of list(value, limit)) {
    const id = int(v);
    if (id >= 0 && exists(id)) out.add(id);
  }
  return [...out];
};

const furnitureList = (value: unknown): FurnitureRecord[] => {
  const out: FurnitureRecord[] = [];
  for (const entry of list(value, 120)) {
    const r = record(entry);
    const kind = int(r['kind']);
    if (!propById(kind)?.furniture) continue;
    out.push({ kind, x: signed(r['x']), z: signed(r['z']), rot: int(r['rot']) & 3 });
  }
  return out;
};

const exists = {
  item: (id: number) => (itemById(id)?.price ?? 0) > 0,
  accessory: (id: number) => accessoryById(id) !== undefined && !accessoryById(id)?.uniform,
  vehicle: (id: number) => VEHICLES.some((v) => v.id === id && v.price > 0),
  furniture: (id: number) => propById(id)?.furniture !== undefined,
};

export const emptyStats = (): StatsRecord => ({ deliveries: 0, fares: 0, arrests: 0, treated: 0, served: 0, fish: 0 });

export const emptyProgress = (): ProgressFields => ({
  money: STARTING_MONEY,
  earned: 0,
  playSeconds: 0,
  job: 'civilian',
  items: [],
  held: 0,
  accessories: [],
  wearing: { hat: 0, face: 0, back: 0 },
  vehicles: [],
  houseStyles: [0],
  homes: {},
  furniture: [],
  lastHouse: -1,
  stats: emptyStats(),
  dailyDay: -1,
});

/** Just the progression of a profile, coerced. A missing field is the fresh player's. */
export const progressOf = (raw: Partial<ProgressFields> | Record<string, unknown>): ProgressFields => {
  const source = record(raw);
  const fresh = emptyProgress();
  const wearing = record(source['wearing']);
  const accessories = ids(source['accessories'], exists.accessory);
  const wear = (slot: 'hat' | 'face' | 'back'): number => {
    const id = int(wearing[slot]);
    return accessories.includes(id) && accessoryById(id)?.slot === slot ? id : 0;
  };
  const stats = record(source['stats']);
  const homesRaw = record(source['homes']);
  const homes: Record<string, FurnitureRecord[]> = {};
  for (const style of HOUSE_STYLE_LIST) {
    const key = String(style.index);
    if (key in homesRaw) homes[key] = furnitureList(homesRaw[key]);
  }
  const styles = ids(source['houseStyles'], (id) => HOUSE_STYLE_LIST[id] !== undefined).concat(0);
  const job = text(source['job']);
  const items = stacks(source['items'], exists.item);
  const held = int(source['held']);
  return {
    money: 'money' in source ? Math.min(MAX_MONEY, Math.floor(numeric(source['money']))) : fresh.money,
    earned: numeric(source['earned']),
    playSeconds: numeric(source['playSeconds']),
    job: JOBS.some((j) => j.id === job) ? job : 'civilian',
    items,
    held: items.some((i) => i.id === held) ? held : 0,
    accessories,
    wearing: { hat: wear('hat'), face: wear('face'), back: wear('back') },
    vehicles: ids(source['vehicles'], exists.vehicle),
    houseStyles: [...new Set(styles)].sort((a, b) => a - b),
    homes,
    furniture: stacks(source['furniture'], exists.furniture, 99),
    lastHouse: 'lastHouse' in source ? Math.floor(signed(source['lastHouse'], -1)) : -1,
    stats: {
      deliveries: int(stats['deliveries']),
      fares: int(stats['fares']),
      arrests: int(stats['arrests']),
      treated: int(stats['treated']),
      served: int(stats['served']),
      fish: int(stats['fish']),
    },
    dailyDay: 'dailyDay' in source ? Math.floor(signed(source['dailyDay'], -1)) : -1,
  };
};

export const coerceProfile = (raw: unknown): StoredProfile | null => {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const profile: StoredProfile = {
    ...source,
    ...progressOf(source),
    displayName: text(source['displayName']),
    avatarUrl: text(source['avatarUrl']),
    updatedAt: numeric(source['updatedAt']),
  };
  if (typeof source['migratedFrom'] !== 'string') delete profile.migratedFrom;
  if (typeof source['migratedTo'] !== 'string') delete profile.migratedTo;
  if (typeof source['migratedAt'] !== 'number') delete profile.migratedAt;
  if (source['migratedSnapshot'] && typeof source['migratedSnapshot'] === 'object') {
    profile.migratedSnapshot = progressOf(source['migratedSnapshot'] as Record<string, unknown>);
  } else {
    delete profile.migratedSnapshot;
  }
  return profile;
};

/** Whether a profile holds anything worth carrying into an account. */
export const hasProgress = (p: ProgressFields): boolean =>
  p.earned > 0 ||
  p.money !== STARTING_MONEY ||
  p.items.length > 0 ||
  p.accessories.length > 0 ||
  p.vehicles.length > 0 ||
  p.houseStyles.length > 1 ||
  p.furniture.length > 0 ||
  Object.keys(p.homes).length > 0;
