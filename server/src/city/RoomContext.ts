import type { FxMessage, NoticeMessage, RespawnReason, WorldCollision } from '@palmhaven/shared';
import type { GameState } from '../rooms/state/GameState.js';
import type { Citizen } from './Citizen.js';

/**
 * What a service may do to the room, without holding the room. Every service
 * is handed one of these; none of them can reach a Colyseus client directly.
 */
export interface RoomContext {
  readonly state: GameState;
  readonly collision: WorldCollision;
  now(): number;
  random(): number;
  citizen(sessionId: string): Citizen | undefined;
  citizens(): IterableIterator<Citizen>;
  notify(c: Citizen, kind: NoticeMessage['kind'], text: string): void;
  send(c: Citizen, type: string, payload: unknown): void;
  /** A world effect for everybody. */
  fx(message: FxMessage): void;
  /** THE one way a player is placed (teleport, exit, jail). */
  place(c: Citizen, x: number, y: number, z: number, yaw: number, reason: RespawnReason): void;
  /** Save soon (a purchase, a move-in). */
  persist(c: Citizen): void;
}
