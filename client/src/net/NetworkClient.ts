import {
  MessageType,
  ROOM_NAME,
  type AccessorySlot,
  type AuthStateMessage,
  type ChatMessage,
  type FxMessage,
  type JobActionKind,
  type JobId,
  type MoveMessage,
  type NoticeMessage,
  type PlayerActionKind,
  type RespawnMessage,
  type SelfState,
  type SetAuthMessage,
  type SetAvatarMessage,
  type SetIdentityMessage,
  type ShopId,
  type SitMessage,
  type VehicleActionKind,
} from '@palmhaven/shared';
import { Client, type Room } from 'colyseus.js';
import { clientConfig } from '../config/clientConfig.js';
import { logger } from '../util/logger.js';
import { takeDeepLinkRoom } from './deepLink.js';
import type { ConnectionStatus, NetGameState, NetHouseState, NetPlayerState, NetVehicleState } from './netTypes.js';

const SCOPE = 'NetworkClient';
const PLAYER_ID_KEY = 'palmhaven.playerId';
const JOIN_BACKOFF_MS = [1000, 2000, 4000, 8000, 15000] as const;
const STORAGE_UNAVAILABLE = 4105;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const resolvePlayerId = (): string => {
  const fresh = `p_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  try {
    const existing = window.localStorage.getItem(PLAYER_ID_KEY);
    if (existing) return existing;
    window.localStorage.setItem(PLAYER_ID_KEY, fresh);
  } catch {
    return fresh;
  }
  return fresh;
};

export interface NetworkHandlers {
  onStatusChange?(status: ConnectionStatus, detail?: string): void;
  onSelfJoined?(sessionId: string): void;
  onRespawn?(message: RespawnMessage): void;
  onSelf?(state: SelfState): void;
  onNotice?(message: NoticeMessage): void;
  onFx?(message: FxMessage): void;
  onChat?(message: ChatMessage): void;
  onAuthState?(message: AuthStateMessage): void;
  /** A state patch landed. */
  onPatch?(): void;
}

/**
 * Thin wrapper over colyseus.js. The rest of the client never imports
 * colyseus.js directly and never writes to the room: it READS the replicated
 * state and SENDS requests.
 */
export class NetworkClient {
  private readonly handlers: NetworkHandlers;
  private client: Client | null = null;
  private room: Room<NetGameState> | null = null;
  private status: ConnectionStatus = 'idle';
  private token: (() => string | null) | null = null;
  private sentToken: string | null | undefined = undefined;
  private look: (() => SetAvatarMessage | null) | null = null;
  private identityOf: (() => SetIdentityMessage) | null = null;
  private serverNow = 0;
  private serverNowAt = 0;

  constructor(handlers: NetworkHandlers = {}) {
    this.handlers = handlers;
  }

  setLookProvider(provider: () => SetAvatarMessage | null): void {
    this.look = provider;
  }

  setTokenProvider(provider: () => string | null): void {
    this.token = provider;
  }

  setDisplayProvider(provider: () => SetIdentityMessage): void {
    this.identityOf = provider;
  }

  sendAvatar(message: SetAvatarMessage): void {
    this.room?.send(MessageType.SetAvatar, message);
  }

  sendIdentity(message: SetIdentityMessage): void {
    this.room?.send(MessageType.SetIdentity, message);
  }

  sendAuth(token: string | null): void {
    if (!this.room || token === this.sentToken) return;
    this.sentToken = token;
    this.room.send(MessageType.SetAuth, { token } satisfies SetAuthMessage);
  }

  get sessionId(): string | null {
    return this.room?.sessionId ?? null;
  }

  get roomId(): string {
    return this.room?.roomId ?? '';
  }

  get connected(): boolean {
    return this.room !== null && this.status === 'connected';
  }

  /** The server's wall clock now (ms), extrapolated from its last sample. */
  now(): number {
    if (this.serverNowAt === 0) return Date.now();
    return this.serverNow + (performance.now() - this.serverNowAt);
  }

  get state(): NetGameState | null {
    return this.room?.state ?? null;
  }

  get players(): NetGameState['players'] | null {
    return this.room?.state?.players ?? null;
  }

  get vehicles(): NetGameState['vehicles'] | null {
    return this.room?.state?.vehicles ?? null;
  }

  player(sessionId: string): NetPlayerState | null {
    return this.room?.state?.players?.get(sessionId) ?? null;
  }

  vehicle(id: number): NetVehicleState | null {
    if (!id) return null;
    return this.room?.state?.vehicles?.get(String(id)) ?? null;
  }

  house(id: number): NetHouseState | null {
    return this.room?.state?.houses?.[id] ?? null;
  }

  async connect(): Promise<void> {
    if (!clientConfig.serverUrl) {
      this.setStatus('error');
      throw new Error('No game server is configured. Set VITE_SERVER_URL to the Colyseus endpoint and rebuild.');
    }
    this.setStatus('connecting');
    logger.info(SCOPE, `joining "${ROOM_NAME}" at ${clientConfig.serverUrl}`);
    this.client ??= new Client(clientConfig.serverUrl);
    const playerId = resolvePlayerId();
    const attempts = JOIN_BACKOFF_MS.length + 1;
    let joinedWith: string | null = null;
    // An invite link or the store page's Join button names a room: try that
    // one first. A room that has closed, filled or moved is not an error -
    // the player simply lands in the usual matchmade room instead.
    const wanted = takeDeepLinkRoom();
    if (wanted) {
      const token = this.token?.() ?? null;
      try {
        this.room = await this.client.joinById<NetGameState>(wanted, {
          playerId,
          token,
          avatar: this.look?.() ?? undefined,
          identity: this.identityOf?.() ?? undefined,
        });
        joinedWith = token;
        logger.info(SCOPE, `joined the linked room ${wanted}`);
      } catch (error) {
        logger.warn(SCOPE, `linked room ${wanted} unavailable (${error instanceof Error ? error.message : String(error)}); matchmaking instead`);
      }
    }
    for (let attempt = 1; !this.room; attempt += 1) {
      const token = this.token?.() ?? null;
      try {
        this.room = await this.client.joinOrCreate<NetGameState>(ROOM_NAME, {
          playerId,
          token,
          avatar: this.look?.() ?? undefined,
          identity: this.identityOf?.() ?? undefined,
        });
        joinedWith = token;
        break;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const storageDown = (error as { code?: unknown }).code === STORAGE_UNAVAILABLE;
        logger.warn(SCOPE, `join attempt ${attempt} failed: ${detail}`);
        if (!storageDown && attempt >= attempts) {
          this.setStatus('error', detail);
          throw error;
        }
        const wait = JOIN_BACKOFF_MS[Math.min(attempt, JOIN_BACKOFF_MS.length) - 1] ?? 0;
        this.setStatus('connecting', storageDown ? 'the server is waiting for its database' : `attempt ${attempt + 1}/${attempts}`);
        await sleep(wait);
      }
    }
    if (!this.room) throw new Error('join produced no room');
    this.sentToken = joinedWith;
    this.bindRoom(this.room);
    this.setStatus('connected');
    logger.info(SCOPE, `joined roomId=${this.room.roomId} sessionId=${this.room.sessionId}`);
    this.handlers.onSelfJoined?.(this.room.sessionId);
    this.sendAuth(this.token?.() ?? null);
  }

  // ---------------------------------------------------------------- requests

  private send(type: string, payload: unknown = {}): void {
    this.room?.send(type, payload);
  }

  sendInput(message: MoveMessage): void {
    this.send(MessageType.Move, message);
  }
  requestRespawn(): void {
    this.send(MessageType.RequestRespawn);
  }
  teleport(to: string): void {
    this.send(MessageType.Teleport, { to });
  }
  interact(id: number): void {
    this.send(MessageType.Interact, { id });
  }
  setJob(job: JobId): void {
    this.send(MessageType.SetJob, { job });
  }
  jobAction(action: JobActionKind): void {
    this.send(MessageType.JobAction, { action });
  }
  spawnVehicle(kind: number, paint: number): void {
    this.send(MessageType.SpawnVehicle, { kind, paint });
  }
  despawnVehicle(): void {
    this.send(MessageType.DespawnVehicle);
  }
  enterVehicle(id: number, drive: boolean): void {
    this.send(MessageType.EnterVehicle, { id, drive });
  }
  exitVehicle(): void {
    this.send(MessageType.ExitVehicle);
  }
  vehicleAction(action: VehicleActionKind): void {
    this.send(MessageType.VehicleAction, { action });
  }
  buy(shop: ShopId, id: number, paint?: number): void {
    this.send(MessageType.Buy, paint === undefined ? { shop, id } : { shop, id, paint });
  }
  equip(item: number): void {
    this.send(MessageType.Equip, { item });
  }
  useItem(): void {
    this.send(MessageType.UseItem);
  }
  wear(slot: AccessorySlot, id: number): void {
    this.send(MessageType.Wear, { slot, id });
  }
  claimHouse(house: number, go: boolean): void {
    this.send(MessageType.ClaimHouse, { house, go });
  }
  buyHouse(house: number, go: boolean): void {
    this.send(MessageType.BuyHouse, { house, go });
  }
  leaveHouse(): void {
    this.send(MessageType.LeaveHouse);
  }
  lockHouse(locked: boolean): void {
    this.send(MessageType.LockHouse, { locked });
  }
  placeFurniture(kind: number, x: number, z: number, rot: number, fid?: number): void {
    this.send(MessageType.PlaceFurniture, fid === undefined ? { kind, x, z, rot } : { kind, x, z, rot, fid });
  }
  removeFurniture(fid: number): void {
    this.send(MessageType.RemoveFurniture, { fid });
  }
  emote(emote: number): void {
    this.send(MessageType.Emote, { emote });
  }
  /** A Bloxity catalogue emote, chosen in the portal's picker. */
  bloxityEmote(id: string): void {
    this.send(MessageType.BloxityEmote, { id });
  }
  sit(message: SitMessage): void {
    this.send(MessageType.Sit, message);
  }
  stand(): void {
    this.send(MessageType.Stand);
  }
  say(line: number): void {
    this.send(MessageType.Say, { line });
  }
  giveMoney(to: string, amount: number): void {
    this.send(MessageType.GiveMoney, { to, amount });
  }
  playerAction(target: string, action: PlayerActionKind): void {
    this.send(MessageType.PlayerAction, { target, action });
  }
  struggle(): void {
    this.send(MessageType.Struggle);
  }
  note(note: number, instrument: 'piano' | 'guitar'): void {
    this.send(MessageType.Note, { note, instrument });
  }
  friends(ids: string[]): void {
    this.send(MessageType.Friends, { ids });
  }
  dev(payload: Record<string, unknown>): void {
    this.send('dev', payload);
  }

  async disconnect(): Promise<void> {
    await this.room?.leave(true);
    this.room = null;
    this.sentToken = undefined;
    this.setStatus('disconnected');
  }

  private bindRoom(room: Room<NetGameState>): void {
    room.onStateChange((state) => {
      if (state.now > 0 && state.now !== this.serverNow) {
        this.serverNow = state.now;
        this.serverNowAt = performance.now();
      }
      this.handlers.onPatch?.();
    });
    room.onMessage<RespawnMessage>(MessageType.Respawn, (m) => this.handlers.onRespawn?.(m));
    room.onMessage<SelfState>(MessageType.Self, (m) => this.handlers.onSelf?.(m));
    room.onMessage<NoticeMessage>(MessageType.Notice, (m) => this.handlers.onNotice?.(m));
    room.onMessage<FxMessage>(MessageType.Fx, (m) => this.handlers.onFx?.(m));
    room.onMessage<ChatMessage>(MessageType.Chat, (m) => this.handlers.onChat?.(m));
    room.onMessage<AuthStateMessage>(MessageType.AuthState, (m) => {
      logger.info(SCOPE, `playing as ${m.status}${m.note ? ` (${m.note})` : ''}`);
      this.handlers.onAuthState?.(m);
    });
    room.onError((code, message) => {
      logger.error(SCOPE, `room error ${code}: ${message ?? ''}`);
      this.setStatus('error', message);
    });
    room.onLeave((code) => {
      logger.warn(SCOPE, `left room (code ${code})`);
      this.setStatus('disconnected', `code ${code}`);
    });
  }

  private setStatus(status: ConnectionStatus, detail?: string): void {
    this.status = status;
    this.handlers.onStatusChange?.(status, detail);
  }
}
