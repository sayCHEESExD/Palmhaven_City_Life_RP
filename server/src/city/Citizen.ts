import {
  MAX_MONEY,
  MAX_STACK,
  accessoryByKey,
  jobById,
  type Task,
} from '@palmhaven/shared';
import type { ProgressFields } from '../persistence/index.js';
import type { PlayerState } from '../rooms/state/PlayerState.js';

/**
 * ONE RESIDENT IN THIS ROOM: their replicated body (`player`), their saved
 * progress (`profile`) and the bookkeeping the services need between ticks.
 * Never replicated as a whole - only `Self` snapshots and `player` fields.
 */
export interface Citizen {
  readonly sessionId: string;
  key: string;
  accountId: string | null;
  profile: ProgressFields;
  readonly player: PlayerState;
  dirty: boolean;
  lastSelfAt: number;
  lastActionAt: number;

  task: Task | null;
  /** Server clock (ms) the next job call/fare/customer may come. */
  nextTaskAt: number;
  paycheckAt: number;
  teleportAt: number;
  jailUntil: number;
  immuneUntil: number;
  struggle: number;
  /** The vehicle this player spawned (0 = none) and when they may spawn again. */
  vehicle: number;
  spawnAt: number;
  /** The seat they occupy (city seat id or furniture seat key), for releasing it. */
  seatKey: string;
  lastSayAt: number;
  lastGiftAt: number;
  lastHornAt: number;
  lastNoteAt: number;
  /** A fish on the line lands at this server time (0 = not fishing). */
  fishAt: number;
  /** Where they boarded somebody else's taxi, for the driver's tip. */
  rideFrom: { x: number; z: number; vehicle: number } | null;
  treatedAt: number;
  friendIds: Set<string>;
}

export const createCitizen = (sessionId: string, key: string, accountId: string | null, profile: ProgressFields, player: PlayerState, now: number): Citizen => ({
  sessionId,
  key,
  accountId,
  profile,
  player,
  dirty: true,
  lastSelfAt: 0,
  lastActionAt: 0,
  task: null,
  nextTaskAt: now + 4000,
  paycheckAt: now + 180_000,
  teleportAt: 0,
  jailUntil: 0,
  immuneUntil: 0,
  struggle: 0,
  vehicle: 0,
  spawnAt: 0,
  seatKey: '',
  lastSayAt: 0,
  lastGiftAt: 0,
  lastHornAt: 0,
  lastNoteAt: 0,
  fishAt: 0,
  rideFrom: null,
  treatedAt: 0,
  friendIds: new Set(),
});

/** Pay a citizen. `earned` counts toward their lifetime earnings. */
export const addMoney = (c: Citizen, amount: number, earned = true): void => {
  const value = Math.max(0, Math.floor(amount));
  if (value === 0) return;
  c.profile.money = Math.min(MAX_MONEY, c.profile.money + value);
  if (earned) c.profile.earned += value;
  c.dirty = true;
};

/** Take money if they have it. */
export const spend = (c: Citizen, amount: number): boolean => {
  const value = Math.max(0, Math.floor(amount));
  if (c.profile.money < value) return false;
  c.profile.money -= value;
  c.dirty = true;
  return true;
};

/** Put items in the bag (capped per stack). False when the stack is full. */
export const addItem = (c: Citizen, id: number, count = 1): boolean => {
  const list = c.profile.items;
  const stack = list.find((s) => s.id === id);
  if (stack) {
    if (stack.count >= MAX_STACK) return false;
    (stack as { count: number }).count = Math.min(MAX_STACK, stack.count + count);
  } else {
    list.push({ id, count: Math.min(MAX_STACK, count) });
  }
  c.dirty = true;
  return true;
};

/** Use up one of an item. False if they had none. */
export const takeItem = (c: Citizen, id: number): boolean => {
  const list = c.profile.items;
  const index = list.findIndex((s) => s.id === id);
  if (index < 0) return false;
  const stack = list[index]!;
  if (stack.count <= 1) list.splice(index, 1);
  else (stack as { count: number }).count = stack.count - 1;
  if (!list.some((s) => s.id === c.profile.held)) c.profile.held = 0;
  c.dirty = true;
  return true;
};

export const hasItem = (c: Citizen, id: number): boolean => c.profile.items.some((s) => s.id === id && s.count > 0);

/** Recompute what is shown on the body: the uniform hat while on duty, else the chosen one. */
export const dressCitizen = (c: Citizen): void => {
  const job = jobById(c.profile.job);
  const uniform = job?.hat ? accessoryByKey(job.hat).id : 0;
  c.player.hat = uniform || c.profile.wearing.hat;
  c.player.face = c.profile.wearing.face;
  c.player.back = c.profile.wearing.back;
  c.player.job = job?.index ?? 0;
};

export const distance2 = (c: Citizen, x: number, z: number): number => {
  const dx = c.player.x - x;
  const dz = c.player.z - z;
  return dx * dx + dz * dz;
};

export const near = (c: Citizen, x: number, z: number, range: number): boolean => distance2(c, x, z) <= range * range;
