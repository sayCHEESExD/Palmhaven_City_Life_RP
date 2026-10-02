import { Client, Room, ServerError } from '@colyseus/core';
import {
  DAILY_BONUS,
  JOBS,
  MAX_PLAYERS_PER_ROOM,
  MessageType,
  POSE,
  accountKeyFor,
  city,
  isAccountKey,
  isShopId,
  isValidAccountId,
  isValidGuestId,
  placeOf,
  sanitizeAppearance,
  sanitizeIdentity,
  sanitizeProportions,
  type AuthStateMessage,
  type AuthStatus,
  type BuyMessage,
  type EnterVehicleMessage,
  type FriendsMessage,
  type FxMessage,
  type GiveMoneyMessage,
  type InteractMessage,
  type JobActionMessage,
  type MoveMessage,
  type MovementInput,
  type NoteMessage,
  type NoticeMessage,
  type PlaceFurnitureMessage,
  type PlayerActionMessage,
  type RespawnMessage,
  type RespawnReason,
  type SelfState,
  type SetAuthMessage,
  type SetAvatarMessage,
  type SetIdentityMessage,
  type SetJobMessage,
  type SitMessage,
  type SpawnVehicleMessage,
  type TeleportMessage,
  type VehicleActionMessage,
  type WearMessage,
} from '@palmhaven/shared';
import { tokenHash, verifyGameToken } from '../auth/BloxityAuth.js';
import { reportIdentityOf, statRegistry, statValuesOf, type StatRow } from '../bloxity/statReporter.js';
import { addMoney, createCitizen, dressCitizen, near, type Citizen } from '../city/Citizen.js';
import { HouseService } from '../city/HouseService.js';
import { JobService } from '../city/JobService.js';
import type { RoomContext } from '../city/RoomContext.js';
import { ShopService } from '../city/ShopService.js';
import { SocialService } from '../city/SocialService.js';
import { VehicleService } from '../city/VehicleService.js';
import { serverConfig } from '../config/serverConfig.js';
import { MovementService, type InputRouter } from '../movement/MovementService.js';
import { hasProgress, progressOf, type ProfileFields, type ProgressFields, type StoredProfile } from '../persistence/index.js';
import { buxGrants } from '../progression/BuxGrants.js';
import { profileStore } from '../progression/ProfileStore.js';
import { logger } from '../util/logger.js';
import { GameState } from './state/GameState.js';
import { PlayerState } from './state/PlayerState.js';

const SCOPE = 'GameRoom';

const AUTOSAVE_SECONDS = 20;
const GRANT_POLL_MS = 15_000;
const REVERIFY_FIRST_MS = 15_000;
const REVERIFY_MAX_MS = 120_000;
const SWITCH_SAVE_TIMEOUT_MS = 8000;
const LEAVE_SAVE_TIMEOUT_MS = 5000;
const MAX_TOKEN_LENGTH = 4096;
/** Least milliseconds between two gameplay requests from one player. */
const ACTION_GAP_MS = 80;
const SELF_GAP_MS = 150;
const CLOCK_MS = 250;
/** Seconds between GPS teleports. */
const TELEPORT_COOLDOWN = 25;

export const JOIN_ERROR = {
  ROOM_FULL: 4103,
  BAD_PLAYER_ID: 4104,
  STORAGE_UNAVAILABLE: 4105,
} as const;

interface JoinOptions {
  playerId?: string;
  token?: string | null;
  avatar?: SetAvatarMessage;
  identity?: SetIdentityMessage;
}

interface ResolvedProfile {
  readonly key: string;
  readonly guestKey: string;
  readonly accountKey: string | null;
  readonly token: string | null;
  readonly tokenHash: string;
  readonly status: AuthStatus;
  readonly profile: StoredProfile | null;
  readonly migrated: boolean;
}

interface Session {
  key: string;
  guestKey: string;
  accountKey: string | null;
  token: string | null;
  tokenHash: string;
  status: AuthStatus;
  switching: boolean;
  queued: SetAuthMessage | null;
  granting: boolean;
  reverifyAt: number;
  reverifyDelay: number;
  grantPollAt: number;
}

const dayNumber = (ms: number): number => Math.floor(ms / 86_400_000);

/**
 * THE AUTHORITATIVE CITY ROOM.
 *
 * Composition only: every rule lives in a service, and this decides the order
 * they run in. Nothing a client sends is copied into state - movement is
 * simulated, and every purchase, job step, seat and siren is checked against
 * the server's own picture of the player, their wallet and the city.
 *
 * WHOSE PROGRESS A SESSION PLAYS ON is decided here too: the client sends its
 * browser id and the portal's TOKEN, Bloxity is asked whose token it is, and
 * the profile is READ FROM STORAGE in `onAuth`.
 */
export class GameRoom extends Room<GameState> {
  override maxClients = MAX_PLAYERS_PER_ROOM;
  override autoDispose = true;

  private readonly movement = new MovementService();
  private readonly citizenMap = new Map<string, Citizen>();
  /** This room's feed into the Bloxity stat reporter (verified accounts only). */
  private offStats: (() => void) | null = null;
  private readonly sessions = new Map<string, Session>();

  private readonly ctx: RoomContext = {
    state: undefined as unknown as GameState,
    collision: this.movement.collision,
    now: () => Date.now(),
    random: () => Math.random(),
    citizen: (id) => this.citizenMap.get(id),
    citizens: () => this.citizenMap.values(),
    notify: (c, kind, text) => this.clientOf(c.sessionId)?.send(MessageType.Notice, { kind, text } satisfies NoticeMessage),
    send: (c, type, payload) => this.clientOf(c.sessionId)?.send(type, payload),
    fx: (message: FxMessage) => this.broadcast(MessageType.Fx, message),
    place: (c, x, y, z, yaw, reason) => this.placeAt(c, x, y, z, yaw, reason),
    persist: (c) => this.persist(c),
  };

  private vehicles!: VehicleService;
  private jobs!: JobService;
  private shops!: ShopService;
  private houses!: HouseService;
  private social!: SocialService;
  private router!: InputRouter;

  private autosaveTimer = 0;
  private clockAt = 0;

  override onCreate(): void {
    this.offStats = statRegistry.addSource(() => {
      const rows: StatRow[] = [];
      for (const c of this.citizenMap.values()) {
        const userId = reportIdentityOf(c.accountId);
        if (userId) rows.push({ userId, values: statValuesOf(c.profile) });
      }
      return rows;
    });
    this.state = new GameState();
    (this.ctx as { state: GameState }).state = this.state;
    this.state.now = Date.now();
    this.setPatchRate(serverConfig.patchRateMs);

    this.vehicles = new VehicleService(this.ctx, this.movement);
    this.jobs = new JobService(this.ctx, this.vehicles);
    this.shops = new ShopService(this.ctx, this.jobs);
    this.houses = new HouseService(this.ctx);
    this.social = new SocialService(this.ctx, this.movement, this.vehicles, this.houses, this.jobs);
    this.vehicles.onPassengerExit = (passenger, info) => this.jobs.playerFare(passenger, info);
    this.router = {
      drive: (sessionId: string, input: MovementInput, dt: number) => this.vehicles.drive(sessionId, input, dt),
      obstacles: () => this.vehicles.obstacles(),
      standUp: (sessionId: string) => {
        const c = this.citizenMap.get(sessionId);
        if (c) this.social.stand(c);
      },
    };

    this.onMessage(MessageType.Move, (client, message: MoveMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (player) this.movement.applyInput(client.sessionId, player, message, this.router);
    });
    this.onMessage(MessageType.SetIdentity, (client, message: SetIdentityMessage) => this.onSetIdentity(client, message));
    this.onMessage(MessageType.SetAvatar, (client, message: SetAvatarMessage) => this.onSetAvatar(client, message));
    this.onMessage(MessageType.SetAuth, (client, message: SetAuthMessage) => {
      void this.switchAuth(client, message, false);
    });

    this.action(MessageType.RequestRespawn, (c) => this.respawn(c));
    this.action(MessageType.Teleport, (c, m: TeleportMessage) => this.teleport(c, String(m?.to ?? '')));
    this.action(MessageType.Interact, (c, m: InteractMessage) => this.interact(c, Number(m?.id)));
    this.action(MessageType.SetJob, (c, m: SetJobMessage) => {
      if (JOBS.some((j) => j.id === m?.job)) this.jobs.setJob(c, m.job);
    });
    this.action(MessageType.JobAction, (c, m: JobActionMessage) => {
      if (m?.action === 'deliver' || m?.action === 'arrest' || m?.action === 'treat' || m?.action === 'cancel') this.jobs.action(c, m.action);
    });

    this.action(MessageType.SpawnVehicle, (c, m: SpawnVehicleMessage) => {
      if (!this.social.inCustody(c)) this.vehicles.spawn(c, Number(m?.kind), Number(m?.paint));
    });
    this.action(MessageType.DespawnVehicle, (c) => {
      if (c.vehicle) this.vehicles.despawn(c.vehicle);
    });
    this.action(MessageType.EnterVehicle, (c, m: EnterVehicleMessage) => {
      if (!this.social.inCustody(c)) this.vehicles.enter(c, Number(m?.id), m?.drive === true);
    });
    this.action(MessageType.ExitVehicle, (c) => {
      if (!this.social.inCustody(c)) this.vehicles.exit(c);
    });
    this.action(MessageType.VehicleAction, (c, m: VehicleActionMessage) => {
      if (m?.action === 'lights' || m?.action === 'siren' || m?.action === 'horn' || m?.action === 'lock') this.vehicles.action(c, m.action);
    });

    this.action(MessageType.Buy, (c, m: BuyMessage) => {
      if (isShopId(m?.shop)) this.shops.buy(c, m.shop, Number(m?.id), Number(m?.paint));
    });
    this.action(MessageType.Equip, (c, m: { item?: number }) => this.social.equip(c, Math.floor(Number(m?.item) || 0)));
    this.action(MessageType.UseItem, (c) => this.social.useItem(c));
    this.action(MessageType.Wear, (c, m: WearMessage) => this.wear(c, m));

    this.action(MessageType.ClaimHouse, (c, m: { house?: number; go?: boolean }) => this.houses.claim(c, Math.floor(Number(m?.house)), m?.go === true));
    this.action(MessageType.BuyHouse, (c, m: { house?: number; go?: boolean }) => this.houses.buy(c, Math.floor(Number(m?.house)), m?.go === true));
    this.action(MessageType.LeaveHouse, (c) => {
      this.houses.leave(c);
      this.persist(c);
    });
    this.action(MessageType.LockHouse, (c, m: { locked?: boolean }) => this.houses.lock(c, m?.locked === true));
    this.action(MessageType.PlaceFurniture, (c, m: PlaceFurnitureMessage) => this.houses.place(c, m));
    this.action(MessageType.RemoveFurniture, (c, m: { fid?: number }) => this.houses.remove(c, Math.floor(Number(m?.fid))));

    this.action(MessageType.Emote, (c, m: { emote?: number }) => this.social.emote(c, Math.floor(Number(m?.emote) || 0)));
    this.action(MessageType.BloxityEmote, (c, m: { id?: unknown }) => this.social.bloxityEmote(c, m?.id));
    this.action(MessageType.Sit, (c, m: SitMessage) => this.social.sit(c, m));
    this.action(MessageType.Stand, (c) => this.social.stand(c));
    this.action(MessageType.Say, (c, m: { line?: number }) => this.social.say(c, Number(m?.line)));
    this.action(MessageType.GiveMoney, (c, m: GiveMoneyMessage) => this.social.give(c, String(m?.to ?? ''), Number(m?.amount)));
    this.action(MessageType.PlayerAction, (c, m: PlayerActionMessage) => {
      const allowed = ['cuff', 'release', 'treat', 'wave', 'highfive', 'hug', 'book'];
      if (allowed.includes(String(m?.action))) this.social.playerAction(c, String(m?.target ?? ''), m.action);
    });
    this.onMessage(MessageType.Struggle, (client) => {
      const c = this.citizenMap.get(client.sessionId);
      if (c) this.social.struggle(c);
    });
    this.onMessage(MessageType.Note, (client, m: NoteMessage) => {
      const c = this.citizenMap.get(client.sessionId);
      if (c) this.social.note(c, Number(m?.note), m?.instrument === 'guitar' ? 'guitar' : 'piano');
    });
    this.action(MessageType.Friends, (c, m: FriendsMessage) => {
      const ids = Array.isArray(m?.ids) ? m.ids.slice(0, 300).filter((id): id is string => isValidAccountId(id)) : [];
      c.friendIds = new Set(ids);
    });
    if (serverConfig.devCheats) {
      this.onMessage('dev', (client, m: { money?: number; tp?: number[] }) => {
        const c = this.citizenMap.get(client.sessionId);
        if (!c) return;
        if (typeof m?.money === 'number') addMoney(c, Math.min(1e7, m.money), false);
        if (Array.isArray(m?.tp) && m.tp.length >= 2) this.placeAt(c, Number(m.tp[0]), Number(m.tp[2] ?? 1), Number(m.tp[1]), 0, 'teleport');
        c.dirty = true;
      });
    }

    this.setSimulationInterval((deltaMs) => this.tick(deltaMs / 1000), serverConfig.patchRateMs);
    logger.info(SCOPE, `room ${this.roomId} created (capacity ${MAX_PLAYERS_PER_ROOM}, ${city().solids.length} solids)`);
  }

  /** A gameplay request: rate limited, and only for a seated citizen. */
  private action<T>(type: string, handle: (c: Citizen, message: T) => void): void {
    this.onMessage(type, (client, message: T) => {
      const c = this.citizenMap.get(client.sessionId);
      const session = this.sessions.get(client.sessionId);
      if (!c || !session || session.switching) return;
      const now = Date.now();
      if (now - c.lastActionAt < ACTION_GAP_MS) return;
      c.lastActionAt = now;
      handle(c, message);
    });
  }

  private clientOf(sessionId: string): Client | undefined {
    return this.clients.find((c) => c.sessionId === sessionId);
  }

  override async onAuth(client: Client, options: JoinOptions = {}): Promise<ResolvedProfile> {
    if (this.clients.length >= MAX_PLAYERS_PER_ROOM) {
      throw new ServerError(JOIN_ERROR.ROOM_FULL, 'room is full');
    }
    const guestKey = readGuestKey(options.playerId);
    const token = readToken(options.token);
    try {
      return await this.resolveProfile(guestKey, token, null);
    } catch (error) {
      logger.error(SCOPE, `refused a join: storage unreachable for ${client.sessionId}:`, error);
      throw new ServerError(JOIN_ERROR.STORAGE_UNAVAILABLE, 'storage unavailable, try again shortly');
    }
  }

  override onJoin(client: Client, options: JoinOptions = {}, auth?: ResolvedProfile): void {
    const resolved: ResolvedProfile = auth ?? { key: '', guestKey: '', accountKey: null, token: null, tokenHash: '', status: 'guest', profile: null, migrated: false };
    const player = new PlayerState();
    player.sessionId = client.sessionId;
    const now = Date.now();
    this.sessions.set(client.sessionId, {
      key: resolved.key,
      guestKey: resolved.guestKey,
      accountKey: resolved.accountKey,
      token: resolved.token,
      tokenHash: resolved.tokenHash,
      status: resolved.status,
      switching: false,
      queued: null,
      granting: false,
      reverifyAt: now + REVERIFY_FIRST_MS,
      reverifyDelay: REVERIFY_FIRST_MS,
      grantPollAt: now + GRANT_POLL_MS,
    });

    if (resolved.profile) {
      player.displayName = resolved.profile.displayName;
      player.avatarUrl = resolved.profile.avatarUrl;
    }
    if (options.avatar) this.writeAvatar(player, options.avatar);
    if (options.identity) {
      const identity = sanitizeIdentity(options.identity);
      if (identity.displayName) {
        player.displayName = identity.displayName;
        player.avatarUrl = identity.avatarUrl;
      }
    }

    const c = createCitizen(client.sessionId, resolved.key, accountIdOf(resolved.accountKey), profileStore.progressFrom(resolved.profile), player, now);
    this.state.players.set(client.sessionId, player);
    this.citizenMap.set(client.sessionId, c);
    const spawn = placeOf('spawn');
    const x = spawn.x + (Math.random() - 0.5) * 16;
    const z = spawn.z + (Math.random() - 0.5) * 6;
    this.movement.initialise(player, x, spawn.y, z, spawn.yaw);
    this.seat(c);
    this.placeAt(c, x, spawn.y, z, spawn.yaw, 'join');
    this.sendAuthState(client, resolved.status);
    this.flushSelf(c, true);
    if (resolved.accountKey) void this.applyGrants(client.sessionId);
    logger.info(SCOPE, `join ${client.sessionId} as ${describe(resolved)} (${resolved.profile ? 'restored' : 'new'}) money=${c.profile.money}`);
  }

  /** Dress them, put them back on their job and in their home. */
  private seat(c: Citizen): void {
    dressCitizen(c);
    c.player.item = c.profile.held;
    this.houses.autoClaim(c);
  }

  override async onLeave(client: Client): Promise<void> {
    const c = this.citizenMap.get(client.sessionId);
    const key = this.sessions.get(client.sessionId)?.key;
    if (c) {
      this.vehicles.release(c);
      this.social.release(c);
      this.shops.release(c);
    }
    const fields = c ? this.fieldsOf(c) : null;
    if (c) statRegistry.depart(c.accountId, c.profile);
    if (c) this.houses.leave(c, true);
    this.state.players.delete(client.sessionId);
    this.citizenMap.delete(client.sessionId);
    this.movement.forget(client.sessionId);
    this.sessions.delete(client.sessionId);
    logger.info(SCOPE, `leave ${client.sessionId}`);
    if (fields && key) await this.saveBounded(key, fields);
  }

  override async onDispose(): Promise<void> {
    const saves: Promise<void>[] = [];
    this.offStats?.();
    for (const [sessionId, c] of this.citizenMap) {
      statRegistry.depart(c.accountId, c.profile);
      const key = this.sessions.get(sessionId)?.key;
      if (key) saves.push(this.saveBounded(key, this.fieldsOf(c)));
    }
    await Promise.all(saves);
    logger.info(SCOPE, `room ${this.roomId} disposed`);
  }

  // -------------------------------------------------------------- gameplay

  private respawn(c: Citizen): void {
    if (this.social.inCustody(c)) return;
    if (c.player.vehicle) this.vehicles.exit(c, true);
    if (c.player.pose !== POSE.stand) this.social.stand(c);
    const spawn = placeOf('spawn');
    this.placeAt(c, spawn.x, spawn.y, spawn.z, spawn.yaw, 'manual');
  }

  private teleport(c: Citizen, to: string): void {
    if (this.social.inCustody(c)) {
      this.ctx.notify(c, 'bad', 'Not while you are in custody!');
      return;
    }
    const now = Date.now();
    if (now < c.teleportAt) {
      this.ctx.notify(c, 'info', `GPS travel recharging: ${Math.ceil((c.teleportAt - now) / 1000)}s`);
      return;
    }
    if (c.player.vehicle) this.vehicles.exit(c, true);
    if (c.player.pose !== POSE.stand) this.social.stand(c);
    if (to === 'home') {
      if (!this.houses.goHome(c)) {
        this.ctx.notify(c, 'info', 'You don\'t have a home yet. Open Homes on your phone to move in!');
        return;
      }
    } else {
      const place = city().placeById.get(to);
      if (!place) return;
      this.placeAt(c, place.x, place.y, place.z, place.yaw, 'teleport');
    }
    c.teleportAt = now + TELEPORT_COOLDOWN * 1000;
    c.dirty = true;
  }

  /** E at one of the city's interaction points. */
  private interact(c: Citizen, id: number): void {
    const it = city().interactables[id];
    if (!it || this.social.inCustody(c)) return;
    const worker = Math.hypot(c.player.x - it.bx, c.player.z - it.bz) < 7;
    if (!near(c, it.x, it.z, 8) && !worker) return;
    switch (it.kind) {
      case 'register':
        if (this.shops.isWorkerAt(c, it)) this.shops.register(c, it);
        return;
      case 'station':
        this.shops.station(c, it);
        return;
      case 'atm': {
        const today = dayNumber(Date.now());
        if (c.profile.dailyDay === today) {
          this.ctx.notify(c, 'info', 'You already collected today\'s bonus. Come back tomorrow!');
          return;
        }
        c.profile.dailyDay = today;
        addMoney(c, DAILY_BONUS, false);
        this.ctx.notify(c, 'gold', `Daily bonus: +$${DAILY_BONUS}!`);
        this.ctx.send(c, MessageType.Fx, { kind: 'cash', x: it.x, y: it.y + 3, z: it.z, data: DAILY_BONUS } satisfies FxMessage);
        c.dirty = true;
        this.persist(c);
        return;
      }
      case 'pump':
        this.vehicles.refuel(c, it.bx, it.bz);
        return;
      case 'depot':
        this.jobs.loadParcels(c, it.x, it.z);
        return;
      case 'locker':
        if (it.job) this.jobs.setJob(c, c.profile.job === it.job ? 'civilian' : it.job);
        return;
      default:
        return;
    }
  }

  private wear(c: Citizen, m: WearMessage): void {
    const slot = m?.slot;
    if (slot !== 'hat' && slot !== 'face' && slot !== 'back') return;
    const id = Math.floor(Number(m?.id) || 0);
    if (id !== 0 && !c.profile.accessories.includes(id)) return;
    c.profile.wearing[slot] = id;
    dressCitizen(c);
    c.dirty = true;
  }

  // ------------------------------------------------------------- identity

  private async resolveProfile(guestKey: string, token: string | null, live: ProfileFields | null): Promise<ResolvedProfile> {
    let status: AuthStatus = 'guest';
    let accountKey: string | null = null;
    const hash = token ? tokenHash(token) : '';
    if (token) {
      const outcome = await verifyGameToken(token);
      if (outcome.status === 'verified') {
        accountKey = accountKeyFor(outcome.accountId);
        status = 'account';
      } else if (outcome.status === 'unavailable') {
        status = 'unavailable';
      }
    }

    if (accountKey) {
      let profile = await profileStore.load(accountKey);
      let migrated = false;
      if (!profile && guestKey) {
        const guest = await profileStore.load(guestKey);
        const retired = Boolean(guest?.migratedTo);
        const source: ProfileFields | null =
          live ?? (guest ? { ...progressOf(guest), displayName: guest.displayName, avatarUrl: guest.avatarUrl, updatedAt: guest.updatedAt } : null);
        if (!retired && source && hasProgress(source)) {
          const created = { ...source, updatedAt: Date.now(), migratedFrom: guestKey };
          if (await profileStore.insertIfAbsent(accountKey, created)) {
            await profileStore.retireGuest(guestKey, accountKey, progressOf(source), { displayName: source.displayName, avatarUrl: source.avatarUrl });
            profile = await profileStore.load(accountKey);
            migrated = true;
            logger.info(SCOPE, `migrated guest ${guestKey} into ${accountKey}`);
          } else {
            profile = await profileStore.load(accountKey);
          }
        }
      }
      return { key: accountKey, guestKey, accountKey, token, tokenHash: hash, status, profile, migrated };
    }

    const profile = guestKey ? await profileStore.load(guestKey) : null;
    return { key: guestKey, guestKey, accountKey: null, token, tokenHash: hash, status, profile, migrated: false };
  }

  private async switchAuth(client: Client, message: SetAuthMessage, reverify: boolean): Promise<void> {
    const session = this.sessions.get(client.sessionId);
    const c = this.citizenMap.get(client.sessionId);
    if (!session || !c) return;
    const token = readToken(message?.token);
    if (session.switching) {
      session.queued = { token };
      return;
    }
    const hash = token ? tokenHash(token) : '';
    if (!reverify && hash === session.tokenHash) return;

    session.switching = true;
    try {
      const leavingKey = session.key;
      const wasGuest = session.accountKey === null;
      const live = this.fieldsOf(c);
      if (leavingKey) {
        const landed = await withTimeout(profileStore.save(leavingKey, live), SWITCH_SAVE_TIMEOUT_MS);
        if (!landed) {
          this.sendAuthState(client, session.status, 'storage unavailable; staying on the current profile');
          return;
        }
      }
      let target: ResolvedProfile;
      try {
        target = await this.resolveProfile(session.guestKey, token, wasGuest ? live : null);
      } catch (error) {
        logger.warn(SCOPE, `${client.sessionId}: storage unreachable during a login change; staying put:`, error);
        this.sendAuthState(client, session.status, 'storage unavailable; staying on the current profile');
        return;
      }
      session.token = target.token;
      session.tokenHash = target.tokenHash;
      if (target.status === 'unavailable') {
        session.reverifyDelay = Math.min(REVERIFY_MAX_MS, session.reverifyDelay * 2);
        session.reverifyAt = Date.now() + session.reverifyDelay;
      } else {
        session.reverifyDelay = REVERIFY_FIRST_MS;
      }
      if (target.key === session.key) {
        session.status = target.status;
        this.sendAuthState(client, target.status);
        return;
      }
      // Re-seat on the new profile.
      this.vehicles.release(c);
      this.houses.leave(c, true);
      c.profile = profileStore.progressFrom(target.profile);
      c.key = target.key;
      c.accountId = accountIdOf(target.accountKey);
      c.task = null;
      session.key = target.key;
      session.accountKey = target.accountKey;
      session.status = target.status;
      this.seat(c);
      this.flushSelf(c, true);
      if (target.key) await this.saveBounded(target.key, this.fieldsOf(c));
      this.sendAuthState(client, target.status);
      logger.info(SCOPE, `${client.sessionId} switched ${leavingKey || '(none)'} -> ${describe(target)}${target.migrated ? ' [migrated]' : ''}`);
    } finally {
      session.switching = false;
      const queued = session.queued;
      session.queued = null;
      if (queued) void this.switchAuth(client, queued, false);
      else if (session.accountKey) void this.applyGrants(client.sessionId);
    }
  }

  private sendAuthState(client: Client, status: AuthStatus, note?: string): void {
    const message: AuthStateMessage = note ? { status, note } : { status };
    client.send(MessageType.AuthState, message);
  }

  private onSetAvatar(client: Client, message: SetAvatarMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (player) this.writeAvatar(player, message);
  }

  private onSetIdentity(client: Client, message: SetIdentityMessage): void {
    const c = this.citizenMap.get(client.sessionId);
    if (!c) return;
    const identity = sanitizeIdentity(message);
    if (c.player.displayName === identity.displayName && c.player.avatarUrl === identity.avatarUrl) return;
    c.player.displayName = identity.displayName;
    c.player.avatarUrl = identity.avatarUrl;
    const house = this.state.houses[c.player.house];
    if (house && house.owner === c.sessionId) house.ownerName = identity.displayName || 'Guest';
    this.persist(c);
  }

  private writeAvatar(player: PlayerState, message: SetAvatarMessage): void {
    player.avatar.apply(sanitizeAppearance(message?.appearance), sanitizeProportions(message?.proportions));
  }

  // ----------------------------------------------------------------- clock

  private tick(delta: number): void {
    const now = Date.now();
    if (now - this.clockAt >= CLOCK_MS) {
      this.clockAt = now;
      this.state.now = now;
    }
    this.tickSessions();
    this.vehicles.tick();
    this.shops.tick();
    for (const c of this.citizenMap.values()) {
      if (c.player.ready) c.profile.playSeconds += delta;
      this.jobs.tick(c);
      this.social.tick(c);
      this.social.tickBloxityEmote(c, now);
      this.flushSelf(c, false);
    }
    this.autosaveTimer += delta;
    if (this.autosaveTimer >= AUTOSAVE_SECONDS) {
      this.autosaveTimer = 0;
      for (const c of this.citizenMap.values()) this.persist(c);
    }
  }

  private flushSelf(c: Citizen, force: boolean): void {
    if (!c.dirty && !force) return;
    const now = Date.now();
    if (!force && now - c.lastSelfAt < SELF_GAP_MS) return;
    const client = this.clientOf(c.sessionId);
    if (!client) return;
    c.dirty = false;
    c.lastSelfAt = now;
    client.send(MessageType.Self, this.selfOf(c));
  }

  private selfOf(c: Citizen): SelfState {
    const p = c.profile;
    return {
      money: p.money,
      earned: p.earned,
      playSeconds: p.playSeconds,
      job: (JOBS.find((j) => j.id === p.job) ?? JOBS[0]!).id,
      task: c.task,
      items: p.items,
      held: p.held,
      accessories: p.accessories,
      wearing: p.wearing,
      vehicles: p.vehicles,
      spawned: c.vehicle,
      houseStyles: p.houseStyles,
      house: c.player.house,
      furniture: p.furniture,
      stats: p.stats,
      dailyReady: p.dailyDay !== dayNumber(Date.now()),
      paycheckAt: c.paycheckAt,
      teleportAt: c.teleportAt,
      jailUntil: c.jailUntil,
    };
  }

  private tickSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (session.switching) continue;
      if (session.status === 'unavailable' && session.token && now >= session.reverifyAt) {
        session.reverifyAt = now + session.reverifyDelay;
        const client = this.clientOf(sessionId);
        if (client) void this.switchAuth(client, { token: session.token }, true);
      }
      if (session.accountKey && now >= session.grantPollAt) {
        session.grantPollAt = now + GRANT_POLL_MS;
        void this.applyGrants(sessionId);
      }
    }
  }

  private async applyGrants(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    const c = this.citizenMap.get(sessionId);
    if (!session || !c || !session.accountKey || session.switching || session.granting) return;
    const accountKey = session.accountKey;
    session.granting = true;
    try {
      const grants = await buxGrants.claim(accountKey);
      if (grants.length === 0) return;
      if (this.sessions.get(sessionId) !== session || session.accountKey !== accountKey || session.switching) return;
      for (const grant of grants) {
        if (grant.coins > 0) addMoney(c, grant.coins, false);
        this.ctx.notify(c, 'gold', `Purchase received: +$${grant.coins.toLocaleString('en-US')}!`);
      }
      await profileStore.save(accountKey, this.fieldsOf(c));
      await buxGrants.settle(grants.map((grant) => grant.transactionId));
    } catch (error) {
      logger.warn(SCOPE, `could not pay grants for ${accountKey}: ${String(error)}`);
    } finally {
      session.granting = false;
    }
  }

  // ------------------------------------------------------------- placement

  /** THE one way a player is placed. */
  private placeAt(c: Citizen, x: number, y: number, z: number, yaw: number, reason: RespawnReason): void {
    const client = this.clientOf(c.sessionId);
    this.movement.teleport(c.sessionId, c.player, x, y, z, yaw);
    if (reason !== 'exit') c.player.pose = POSE.stand;
    const message: RespawnMessage = { x, y, z, rotationY: yaw, reason };
    client?.send(MessageType.Respawn, message);
  }

  // ----------------------------------------------------------------- saves

  private fieldsOf(c: Citizen): ProfileFields {
    this.houses.snapshot(c);
    const progress: ProgressFields = { ...c.profile };
    return { ...progress, displayName: c.player.displayName, avatarUrl: c.player.avatarUrl, updatedAt: Date.now() };
  }

  private persist(c: Citizen): void {
    const session = this.sessions.get(c.sessionId);
    if (!session || !session.key || session.switching) return;
    void this.saveQuietly(session.key, this.fieldsOf(c));
  }

  private async saveQuietly(key: string, fields: ProfileFields): Promise<void> {
    try {
      await profileStore.save(key, fields);
    } catch (error) {
      logger.error(SCOPE, `save of ${key} failed:`, error);
    }
  }

  private async saveBounded(key: string, fields: ProfileFields): Promise<void> {
    const landed = await withTimeout(this.saveQuietly(key, fields), LEAVE_SAVE_TIMEOUT_MS);
    if (!landed) logger.warn(SCOPE, `save of ${key} is queued; it lands when storage is back`);
  }
}

const accountIdOf = (accountKey: string | null): string | null => (accountKey && isAccountKey(accountKey) ? accountKey.slice('bloxity:'.length) : null);

const readGuestKey = (raw: unknown): string => {
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw === 'string' && isAccountKey(raw)) throw new ServerError(JOIN_ERROR.BAD_PLAYER_ID, 'invalid player id');
  if (!isValidGuestId(raw)) throw new ServerError(JOIN_ERROR.BAD_PLAYER_ID, 'invalid player id');
  return raw;
};

const readToken = (raw: unknown): string | null =>
  typeof raw === 'string' && raw.length > 0 && raw.length <= MAX_TOKEN_LENGTH ? raw : null;

const describe = (resolved: ResolvedProfile): string => {
  if (resolved.accountKey) return `account ${resolved.accountKey}`;
  const key = resolved.guestKey || '(no id)';
  return resolved.status === 'unavailable' ? `guest ${key} (bloxity unavailable, will re-ask)` : `guest ${key}`;
};

const withTimeout = (promise: Promise<unknown>, ms: number): Promise<boolean> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
