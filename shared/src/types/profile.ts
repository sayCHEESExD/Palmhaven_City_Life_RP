import type { JobId } from '../config/jobs.js';

/**
 * WHAT A PLAYER OWNS AND IS DOING, as the server tells its owner. The public
 * world (where everyone is, every vehicle, every home's furniture) is
 * replicated through the schema; a player's wallet, bag and current job task
 * travel to their own client only, as the `Self` snapshot.
 */

export interface StackItem {
  readonly id: number;
  readonly count: number;
}

export type TaskKind = 'delivery' | 'taxi' | 'police' | 'medic' | 'order' | 'sale';

/**
 * The job step in progress. One at a time: a parcel to drop off, a fare to
 * pick up, a call to answer, an order to cook.
 */
export interface Task {
  readonly kind: TaskKind;
  /** 'pickup' -> 'dropoff' for parcels and fares; 'goto' for calls; 'make' for orders. */
  readonly stage: 'pickup' | 'dropoff' | 'goto' | 'make' | 'serve';
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** "Deliver to 142 Palm Avenue", "Suspect seen on Lincoln Road". */
  readonly label: string;
  readonly reward: number;
  /** Parcels still on board (delivery). */
  readonly left?: number;
  /** The NPC's look (taxi fares, suspects, patients). */
  readonly look?: number;
  /** Orders: what the customer wants, and what is on the tray so far. */
  readonly order?: readonly string[];
  readonly made?: readonly string[];
  /** Server clock (ms) the task expires at, 0 = never. */
  readonly expires?: number;
}

export interface SelfStats {
  readonly deliveries: number;
  readonly fares: number;
  readonly arrests: number;
  readonly treated: number;
  readonly served: number;
  readonly fish: number;
}

export interface SelfState {
  readonly money: number;
  readonly earned: number;
  readonly playSeconds: number;
  readonly job: JobId;
  readonly task: Task | null;
  /** Items in the bag (id, count). */
  readonly items: readonly StackItem[];
  readonly held: number;
  /** Accessories owned, and worn by slot. */
  readonly accessories: readonly number[];
  readonly wearing: { readonly hat: number; readonly face: number; readonly back: number };
  /** Vehicles owned (ids). Free ones are always available and not listed. */
  readonly vehicles: readonly number[];
  /** The vehicle this player has out, or 0. */
  readonly spawned: number;
  /** House styles owned (indices), and the home they live in here (-1 = none). */
  readonly houseStyles: readonly number[];
  readonly house: number;
  /** Furniture not placed (prop id, count). */
  readonly furniture: readonly StackItem[];
  readonly stats: SelfStats;
  readonly dailyReady: boolean;
  /** Server clock (ms): next paycheck, next teleport, end of jail time. */
  readonly paycheckAt: number;
  readonly teleportAt: number;
  readonly jailUntil: number;
}

/** Emotes: replicated as a byte (0 = none). */
export const EMOTES = [
  { id: 1, key: 'wave', name: 'Wave', seconds: 2.2 },
  { id: 2, key: 'dance', name: 'Dance', seconds: 0 },
  { id: 3, key: 'dance2', name: 'Salsa', seconds: 0 },
  { id: 4, key: 'cheer', name: 'Cheer', seconds: 2.4 },
  { id: 5, key: 'point', name: 'Point', seconds: 2 },
  { id: 6, key: 'laugh', name: 'Laugh', seconds: 2.4 },
  { id: 7, key: 'clap', name: 'Clap', seconds: 2.6 },
  { id: 8, key: 'think', name: 'Think', seconds: 3 },
  { id: 9, key: 'sit', name: 'Sit Down', seconds: 0 },
  { id: 10, key: 'lie', name: 'Lie Down', seconds: 0 },
  { id: 11, key: 'pushups', name: 'Push-ups', seconds: 0 },
  { id: 12, key: 'phone', name: 'On the Phone', seconds: 0 },
] as const;

export type EmoteKey = (typeof EMOTES)[number]['key'];
export const emoteById = (id: number): (typeof EMOTES)[number] | undefined => EMOTES.find((e) => e.id === id);

/** Quick chat: RP lines everyone can say. */
export const CHAT_LINES = [
  'Hi!',
  'Hello neighbor!',
  'Need a ride?',
  'Follow me!',
  'Thank you!',
  'Nice car!',
  'Want to hang out?',
  'Wanna go to the beach?',
  'Come to my house!',
  'One moment please.',
  'Welcome!',
  'Freeze! Police!',
  'Are you okay?',
  'Order up!',
  'Taxi!',
  'See you later!',
  'LOL',
  'Bye!',
] as const;

/** Body poses, replicated as a byte. */
export const POSE = { stand: 0, sit: 1, lie: 2, swing: 3, ride: 4, drive: 5, standOn: 6 } as const;
export type PoseId = (typeof POSE)[keyof typeof POSE];

/** Status bits on a player. */
export const STATUS = { cuffed: 1, jailed: 2, injured: 4 } as const;
