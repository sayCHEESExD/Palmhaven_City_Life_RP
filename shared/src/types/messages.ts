import type { AccessorySlot } from '../config/items.js';
import type { JobId } from '../config/jobs.js';
import type { ShopId } from '../config/shops.js';
import type { AvatarAppearance, AvatarProportions } from './avatar.js';

/**
 * Client -> server input (MessageType.Move). INPUT ONLY: the server simulates
 * the walk or the drive from intent and owns the result.
 */
export interface MoveMessage {
  seq: number;
  dt: number;
  moveX: number;
  moveZ: number;
  jump: boolean;
  sprint: boolean;
  down: boolean;
  cameraYaw: number;
}

export type RespawnReason = 'manual' | 'join' | 'teleport' | 'exit' | 'jail' | 'release';

export interface RespawnMessage {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  reason: RespawnReason;
}

export interface TeleportMessage {
  /** A place id, or 'home'. */
  to: string;
}

export interface InteractMessage {
  id: number;
}

export interface SetJobMessage {
  job: JobId;
}

export type JobActionKind = 'deliver' | 'arrest' | 'treat' | 'cancel';

export interface JobActionMessage {
  action: JobActionKind;
}

export interface SpawnVehicleMessage {
  kind: number;
  paint: number;
}

export interface EnterVehicleMessage {
  id: number;
  /** Ask for the driver's seat (false = any free passenger seat). */
  drive: boolean;
}

export type VehicleActionKind = 'lights' | 'siren' | 'horn' | 'lock';

export interface VehicleActionMessage {
  action: VehicleActionKind;
}

export interface BuyMessage {
  shop: ShopId;
  id: number;
  /** Vehicles: the paint chosen. */
  paint?: number;
}

export interface EquipMessage {
  item: number;
}

export interface WearMessage {
  slot: AccessorySlot;
  id: number;
}

export interface HouseMessage {
  house: number;
}

export interface LockHouseMessage {
  locked: boolean;
}

/** House-local coordinates. `fid` set = move an existing piece. */
export interface PlaceFurnitureMessage {
  kind: number;
  x: number;
  z: number;
  rot: number;
  fid?: number;
}

export interface RemoveFurnitureMessage {
  fid: number;
}

export interface EmoteMessage {
  emote: number;
}

/** Sit on a city seat (`seat`) or on furniture in a home (`house` + `fid` + `index`). */
export interface SitMessage {
  seat?: number;
  house?: number;
  fid?: number;
  index?: number;
}

export interface SayMessage {
  line: number;
}

export interface GiveMoneyMessage {
  to: string;
  amount: number;
}

export type PlayerActionKind = 'cuff' | 'release' | 'treat' | 'wave' | 'highfive' | 'hug' | 'book';

export interface PlayerActionMessage {
  target: string;
  action: PlayerActionKind;
}

export interface NoteMessage {
  note: number;
  instrument: 'piano' | 'guitar';
}

export interface FriendsMessage {
  ids: string[];
}

// ---------------------------------------------------------- server -> client

export interface NoticeMessage {
  kind: 'good' | 'bad' | 'info' | 'gold';
  text: string;
}

export type FxKind =
  | 'cash'
  | 'confetti'
  | 'splash'
  | 'horn'
  | 'note'
  | 'photo'
  | 'crash'
  | 'fish'
  | 'jail'
  | 'heal'
  | 'cuff'
  | 'door'
  | 'eat'
  | 'party'
  | 'wave';

export interface FxMessage {
  kind: FxKind;
  x: number;
  y: number;
  z: number;
  /** Who it is about, when someone. */
  who?: string;
  data?: number;
}

export interface ChatMessage {
  from: string;
  text: string;
}

export interface SetAvatarMessage {
  appearance: AvatarAppearance;
  proportions: AvatarProportions;
}

export interface SetIdentityMessage {
  displayName: string;
  avatarUrl: string;
}

export interface SetAuthMessage {
  token: string | null;
}

export type AuthStatus = 'account' | 'guest' | 'unavailable';

export interface AuthStateMessage {
  status: AuthStatus;
  note?: string;
}
