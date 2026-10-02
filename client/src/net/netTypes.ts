import type { AvatarAppearance, AvatarProportions } from '@palmhaven/shared';
import type { MapSchema } from '@colyseus/schema';

/**
 * Client-side TYPE mirror of the server's Colyseus schema. Types only -
 * colyseus.js builds the concrete instances from the handshake reflection.
 */
export interface NetPlayerState {
  sessionId: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  speed: number;
  verticalVelocity: number;
  grounded: boolean;
  swimming: boolean;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  lastInputSeq: number;
  jumpLatched: boolean;
  jumpCount: number;

  avatar: AvatarAppearance & AvatarProportions;
  displayName: string;
  avatarUrl: string;

  job: number;
  vehicle: number;
  seat: number;
  pose: number;
  emote: number;
  emoteSeq: number;
  bxEmote: string;
  bxEmoteAt: number;
  item: number;
  itemUse: number;
  hat: number;
  face: number;
  back: number;
  status: number;
  escort: string;
  house: number;
  ready: boolean;
}

export interface NetVehicleState {
  id: number;
  kind: number;
  paint: number;
  owner: string;
  ownerName: string;
  driver: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  vy: number;
  grounded: boolean;
  nitro: number;
  throttle: number;
  flags: number;
  fuel: number;
  fare: number;
  horn: number;
}

export interface NetFurnitureState {
  id: number;
  kind: number;
  x: number;
  z: number;
  rot: number;
}

export interface NetHouseState {
  id: number;
  owner: string;
  ownerName: string;
  locked: boolean;
  furniture: MapSchema<NetFurnitureState>;
}

export interface NetShopState {
  shop: string;
  worker: string;
  customer: number;
  order: string;
  since: number;
}

export interface NetGameState {
  players: MapSchema<NetPlayerState>;
  vehicles: MapSchema<NetVehicleState>;
  houses: ArrayLike<NetHouseState>;
  shops: MapSchema<NetShopState>;
  now: number;
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
