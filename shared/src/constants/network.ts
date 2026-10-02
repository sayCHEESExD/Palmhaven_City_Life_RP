/**
 * Network-level constants. Must stay identical on client and server.
 */

/** Colyseus room registered by the server and joined by the client. */
export const ROOM_NAME = 'palmhaven';

/**
 * Default server port. Override with the PORT env var on the server.
 *
 * Deliberately not 2567: the other games in this series occupy 2567-2880 on
 * the same machine, and sharing a port means whichever server starts first
 * silently serves both clients.
 */
export const DEFAULT_SERVER_PORT = 2940;

/** Most players in ONE room. The matchmaker opens another room for the sixteenth. */
export const MAX_PLAYERS_PER_ROOM = 15;

/** How many OTHER players are drawn at once. A rendering limit only. */
export const VISIBLE_REMOTE_PLAYERS = 14;

/** Server simulation / state broadcast rate, in Hz. */
export const SERVER_TICK_RATE = 20;
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE;

/**
 * Client->server and server->client message identifiers.
 *
 * A const object rather than an enum so it survives `verbatimModuleSyntax`.
 */
export const MessageType = {
  /** Client -> server: one frame of INPUT (walking or driving). Never a transform. */
  Move: 'move',
  /** Server -> client: authoritative placement. */
  Respawn: 'respawn',
  RequestRespawn: 'requestRespawn',
  /** Client -> server: GPS teleport to a named place, or home. */
  Teleport: 'teleport',
  /** Client -> server: press E at a city interaction point. */
  Interact: 'interact',
  /** Client -> server: change job. */
  SetJob: 'setJob',
  /** Client -> server: a job step that is not an interaction point (hand over a parcel, arrest a suspect). */
  JobAction: 'jobAction',

  SpawnVehicle: 'spawnVehicle',
  DespawnVehicle: 'despawnVehicle',
  EnterVehicle: 'enterVehicle',
  ExitVehicle: 'exitVehicle',
  /** Lights, siren, horn, lock. */
  VehicleAction: 'vehicleAction',
  Refuel: 'refuel',

  Buy: 'buy',
  /** Hold an item (0 = empty hands). */
  Equip: 'equip',
  /** Use the item in hand (eat, strum, cast a line). */
  UseItem: 'useItem',
  /** Put on or take off an accessory. */
  Wear: 'wear',

  ClaimHouse: 'claimHouse',
  BuyHouse: 'buyHouse',
  LeaveHouse: 'leaveHouse',
  LockHouse: 'lockHouse',
  PlaceFurniture: 'placeFurniture',
  RemoveFurniture: 'removeFurniture',

  Emote: 'emote',
  /** Client -> server: the Bloxity portal's emote picker chose a catalogue emote. */
  BloxityEmote: 'bxEmote',
  Sit: 'sit',
  Stand: 'stand',
  /** A quick-chat line over your head. */
  Say: 'say',
  GiveMoney: 'giveMoney',
  /** Something done TO another player: cuff, release, treat, wave, high five. */
  PlayerAction: 'playerAction',
  /** Mash to slip out of cuffs. */
  Struggle: 'struggle',
  /** A piano or guitar note, for everyone nearby. */
  Note: 'note',
  /** The player's Bloxity friends, for the friends list. */
  Friends: 'friends',

  /** Server -> client: the owner's private state (money, bag, task...). */
  Self: 'self',
  /** Server -> client: the outcome of a request, for a toast. */
  Notice: 'notice',
  /** Server -> client: a one-off world effect. */
  Fx: 'fx',
  /** Server -> client: someone said something. */
  Chat: 'chat',

  SetAvatar: 'setAvatar',
  SetIdentity: 'setIdentity',
  SetAuth: 'setAuth',
  AuthState: 'authState',
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];
