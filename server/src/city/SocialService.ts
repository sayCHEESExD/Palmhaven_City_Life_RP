import {
  BLOXITY_EMOTE,
  isBloxityEmoteId,
  ARREST_IMMUNITY_SECONDS,
  CHAT_LINES,
  EMOTES,
  GIFT_COOLDOWN_SECONDS,
  GIFT_MAX,
  JAIL_SECONDS,
  MessageType,
  PAY,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  POSE,
  STATUS,
  city,
  isLand,
  itemById,
  placeOf,
  visibleName,
  type FxMessage,
  type PlayerActionKind,
  type SeatPose,
  type SitMessage,
} from '@palmhaven/shared';
import type { MovementService } from '../movement/MovementService.js';
import { addMoney, near, spend, takeItem, type Citizen } from './Citizen.js';
import type { HouseService } from './HouseService.js';
import type { JobService } from './JobService.js';
import type { RoomContext } from './RoomContext.js';
import type { VehicleService } from './VehicleService.js';

const POSE_OF: Record<SeatPose, number> = { sit: POSE.sit, lie: POSE.lie, swing: POSE.swing, ride: POSE.ride };
const STRUGGLES_TO_ESCAPE = 28;
const FISH = [
  ['Snapper', 22], ['Grouper', 40], ['Mahi-mahi', 55], ['Tarpon', 70], ['Old Boot', 2], ['Bonefish', 30], ['Blue Marlin', 120], ['Seashell', 6], ['Lobster', 65], ['Pufferfish', 18],
] as const;

/**
 * PEOPLE BEING PEOPLE: emotes, sitting, quick chat, gifts, waves and high
 * fives, items in hand - and the police side of it: cuffs, escorts, booking
 * and the cells.
 */
export class SocialService {
  /** Who sits where: seat key -> session. */
  private readonly seats = new Map<string, string>();

  constructor(
    private readonly ctx: RoomContext,
    private readonly movement: MovementService,
    private readonly vehicles: VehicleService,
    private readonly houses: HouseService,
    private readonly jobs: JobService,
  ) {
    houses.onPieceGone = (c) => this.stand(c);
  }

  // ------------------------------------------------------------- emotes

  emote(c: Citizen, id: number): void {
    if (c.player.vehicle !== 0 || c.player.status !== 0) return;
    if (id !== 0 && !EMOTES.some((e) => e.id === id)) return;
    if (c.player.pose !== POSE.stand) this.stand(c);
    c.player.emote = id;
    c.player.emoteSeq = (c.player.emoteSeq + 1) % 65535;
    c.player.bxEmote = '';
  }

  /**
   * A Bloxity emote, chosen in the portal's own picker. Only the id's shape is
   * checked - never ownership (Bloxity only sends what the player owns) and
   * never whether the id is known (the catalogue grows without a release; a
   * client that does not know it simply ignores it).
   */
  bloxityEmote(c: Citizen, id: unknown): void {
    if (!isBloxityEmoteId(id)) return;
    if (c.player.vehicle !== 0 || c.player.status !== 0 || c.player.pose !== POSE.stand) return;
    const now = this.ctx.now();
    if (now - c.player.bxEmoteAt < BLOXITY_EMOTE.minGapMs) return;
    c.player.emote = 0;
    c.player.bxEmote = id.toLowerCase();
    c.player.bxEmoteAt = now;
  }

  /** Moving, sitting, driving or being cuffed ends a Bloxity emote; so does a very long one. */
  tickBloxityEmote(c: Citizen, now: number): void {
    const p = c.player;
    if (!p.bxEmote) return;
    if (p.speed > BLOXITY_EMOTE.stopSpeed || p.vehicle !== 0 || p.pose !== POSE.stand || p.status !== 0 || now - p.bxEmoteAt > BLOXITY_EMOTE.maxMs) p.bxEmote = '';
  }

  say(c: Citizen, line: number): void {
    const text = CHAT_LINES[Math.floor(line)];
    const now = this.ctx.now();
    if (!text || now - c.lastSayAt < 1200) return;
    c.lastSayAt = now;
    this.ctx.state && this.broadcastChat(c, text);
  }

  private broadcastChat(c: Citizen, text: string): void {
    for (const other of this.ctx.citizens()) this.ctx.send(other, MessageType.Chat, { from: c.sessionId, text });
  }

  // -------------------------------------------------------------- sitting

  sit(c: Citizen, m: SitMessage): void {
    if (c.player.vehicle !== 0 || c.player.status !== 0) return;
    let key = '';
    let seat: { x: number; y: number; z: number; rot: number; pose: SeatPose } | null = null;
    if (typeof m?.seat === 'number') {
      const s = city().seats[Math.floor(m.seat)];
      if (s) {
        key = `s:${s.id}`;
        seat = s;
      }
    } else if (typeof m?.house === 'number' && typeof m.fid === 'number' && typeof m.index === 'number') {
      const s = this.houses.furnitureSeat(Math.floor(m.house), Math.floor(m.fid), Math.floor(m.index));
      if (s) {
        key = `f:${Math.floor(m.house)}:${s.fid}:${s.index}`;
        seat = s;
      }
    }
    if (!seat || !near(c, seat.x, seat.z, 7) || Math.abs(c.player.y - seat.y) > 4) return;
    const taken = this.seats.get(key);
    if (taken && taken !== c.sessionId) {
      this.ctx.notify(c, 'info', 'Someone is sitting there.');
      return;
    }
    if (c.seatKey) this.seats.delete(c.seatKey);
    this.seats.set(key, c.sessionId);
    c.seatKey = key;
    c.player.pose = POSE_OF[seat.pose];
    c.player.emote = 0;
    this.movement.hold(c.sessionId, c.player, seat.x, seat.y, seat.z, seat.rot);
  }

  /** Get up: step off the front of the seat. */
  stand(c: Citizen): void {
    if (c.player.pose === POSE.stand) return;
    if (c.seatKey) this.seats.delete(c.seatKey);
    c.seatKey = '';
    c.player.pose = POSE.stand;
    const yaw = c.player.rotationY;
    const collision = this.ctx.collision;
    for (const [dist, turn] of [[2, 0], [3, 0], [2.4, Math.PI / 2], [2.4, -Math.PI / 2], [2.6, Math.PI], [4, 0]] as const) {
      const x = c.player.x + Math.sin(yaw + turn) * dist;
      const z = c.player.z + Math.cos(yaw + turn) * dist;
      collision.mover = c.sessionId;
      const y = collision.floorBelow(x, c.player.y + 1, z, PLAYER_RADIUS, 0.05);
      const blocked = collision.blocked(x, y + 0.02, z, PLAYER_RADIUS, PLAYER_HEIGHT);
      collision.mover = '';
      if (!blocked) {
        this.ctx.place(c, x, y, z, yaw, 'exit');
        return;
      }
    }
    this.ctx.place(c, c.player.x, c.player.y + 0.5, c.player.z, yaw, 'exit');
  }

  release(c: Citizen): void {
    if (c.seatKey) this.seats.delete(c.seatKey);
    c.seatKey = '';
    for (const other of this.ctx.citizens()) {
      if (other.player.escort === c.sessionId) this.uncuff(other, false);
    }
  }

  // --------------------------------------------------------------- items

  equip(c: Citizen, item: number): void {
    if (item !== 0 && !c.profile.items.some((s) => s.id === item)) return;
    c.profile.held = item;
    this.jobs.refreshHeld(c);
    c.dirty = true;
  }

  useItem(c: Citizen): void {
    const id = c.profile.held;
    const item = itemById(id);
    if (!item || c.player.vehicle !== 0 || c.player.status !== 0) return;
    const now = this.ctx.now();
    if (now - c.lastNoteAt < 600) return;
    c.lastNoteAt = now;
    c.player.itemUse = (c.player.itemUse + 1) % 65535;
    const p = c.player;
    switch (item.use) {
      case 'eat':
      case 'drink':
        takeItem(c, id);
        this.jobs.refreshHeld(c);
        this.ctx.fx({ kind: 'eat', x: p.x, y: p.y + 3, z: p.z, who: c.sessionId, data: id });
        break;
      case 'photo':
        this.ctx.fx({ kind: 'photo', x: p.x, y: p.y + 2.6, z: p.z, who: c.sessionId });
        break;
      case 'party':
        this.ctx.fx({ kind: 'party', x: p.x, y: p.y + 2, z: p.z, who: c.sessionId });
        break;
      case 'fish':
        this.cast(c);
        break;
      default:
        break;
    }
  }

  private cast(c: Citizen): void {
    if (c.fishAt > 0) return;
    const p = c.player;
    let water = false;
    for (let a = 0; a < 8 && !water; a += 1) {
      const x = p.x + Math.sin(p.rotationY + (a - 4) * 0.35) * 6;
      const z = p.z + Math.cos(p.rotationY + (a - 4) * 0.35) * 6;
      water = !isLand(x, z);
    }
    if (!water) {
      this.ctx.notify(c, 'info', 'Face the water to cast your line (try the pier or a dock).');
      return;
    }
    c.fishAt = this.ctx.now() + 2500 + this.ctx.random() * 5000;
    this.ctx.notify(c, 'info', 'You cast your line...');
  }

  // ------------------------------------------------------------- between players

  give(c: Citizen, to: string, amount: number): void {
    const target = this.ctx.citizen(to);
    const value = Math.floor(amount);
    if (!target || target === c || !Number.isFinite(value) || value <= 0 || value > GIFT_MAX) return;
    if (!near(c, target.player.x, target.player.z, 14)) return;
    const now = this.ctx.now();
    if (now - c.lastGiftAt < GIFT_COOLDOWN_SECONDS * 1000) {
      this.ctx.notify(c, 'info', 'Wait a moment before giving again.');
      return;
    }
    if (!spend(c, value)) {
      this.ctx.notify(c, 'bad', 'You don\'t have that much.');
      return;
    }
    c.lastGiftAt = now;
    addMoney(target, value, false);
    this.ctx.notify(c, 'good', `You gave $${value} to ${visibleName(target.player.displayName)}.`);
    this.ctx.notify(target, 'gold', `${visibleName(c.player.displayName)} gave you $${value}!`);
    this.ctx.fx({ kind: 'cash', x: target.player.x, y: target.player.y + 3, z: target.player.z, who: target.sessionId, data: value });
  }

  playerAction(c: Citizen, to: string, action: PlayerActionKind): void {
    const target = this.ctx.citizen(to);
    if (!target || target === c) return;
    const close = near(c, target.player.x, target.player.z, 9);
    switch (action) {
      case 'wave':
      case 'highfive':
      case 'hug': {
        if (!close || c.player.vehicle !== 0) return;
        const emote = action === 'wave' ? 1 : action === 'highfive' ? 7 : 4;
        this.emote(c, emote);
        if (action !== 'wave' && target.player.vehicle === 0 && target.player.status === 0) this.emote(target, emote);
        this.ctx.fx({ kind: 'wave', x: target.player.x, y: target.player.y + 3, z: target.player.z, who: c.sessionId, data: action === 'wave' ? 0 : action === 'highfive' ? 1 : 2 });
        return;
      }
      case 'cuff':
        return this.cuff(c, target, close);
      case 'release':
        if (c.profile.job !== 'police' || !(target.player.status & STATUS.cuffed)) return;
        this.uncuff(target, true);
        this.ctx.notify(c, 'info', `You released ${visibleName(target.player.displayName)}.`);
        return;
      case 'book':
        return this.book(c, target);
      case 'treat':
        return this.treat(c, target, close);
    }
  }

  private cuff(c: Citizen, target: Citizen, close: boolean): void {
    if (c.profile.job !== 'police' || !close || c.player.vehicle !== 0 || c.player.status !== 0) return;
    if (target.profile.job === 'police') {
      this.ctx.notify(c, 'bad', 'You can\'t cuff another officer!');
      return;
    }
    if (target.player.status !== 0) return;
    if (this.ctx.now() < target.immuneUntil) {
      this.ctx.notify(c, 'info', 'They were just released. Give them a minute.');
      return;
    }
    if (target.player.vehicle) this.vehicles.exit(target, true);
    if (target.player.pose !== POSE.stand) this.stand(target);
    target.player.status |= STATUS.cuffed;
    target.player.escort = c.sessionId;
    target.player.emote = 0;
    target.struggle = 0;
    target.dirty = true;
    this.ctx.fx({ kind: 'cuff', x: target.player.x, y: target.player.y + 2, z: target.player.z, who: target.sessionId });
    this.ctx.notify(c, 'info', 'Cuffed! Walk them to the Booking Desk at the police station, or release them.');
    this.ctx.notify(target, 'bad', `${visibleName(c.player.displayName)} has cuffed you! Mash SPACE to struggle.`);
  }

  private uncuff(target: Citizen, immune: boolean): void {
    if (target.player.vehicle) this.vehicles.exit(target, true);
    target.player.status &= ~STATUS.cuffed;
    target.player.escort = '';
    target.struggle = 0;
    if (immune) target.immuneUntil = this.ctx.now() + ARREST_IMMUNITY_SECONDS * 1000;
    target.dirty = true;
  }

  /** At the Booking Desk with a cuffed suspect: into a cell they go. */
  private book(c: Citizen, target: Citizen): void {
    if (c.profile.job !== 'police' || target.player.escort !== c.sessionId) return;
    const desk = city().interactables.find((i) => i.kind === 'jail');
    if (!desk || !near(c, desk.x, desk.z, 10)) {
      this.ctx.notify(c, 'info', 'Bring them to the Booking Desk inside the police station.');
      return;
    }
    const cells = city().cells;
    const used = new Set<number>();
    for (const other of this.ctx.citizens()) {
      if (other.player.status & STATUS.jailed) {
        cells.forEach((cell, i) => {
          if (Math.hypot(other.player.x - cell.x, other.player.z - cell.z) < 4) used.add(i);
        });
      }
    }
    const index = cells.findIndex((_, i) => !used.has(i));
    const cell = cells[Math.max(0, index)]!;
    this.uncuff(target, false);
    target.player.status |= STATUS.jailed;
    target.jailUntil = this.ctx.now() + JAIL_SECONDS * 1000;
    this.ctx.place(target, cell.x, cell.y, cell.z, Math.PI, 'jail');
    addMoney(c, PAY.arrest);
    c.profile.stats.arrests += 1;
    this.ctx.notify(c, 'gold', `Suspect booked! +$${PAY.arrest}`);
    this.ctx.notify(target, 'bad', `You're in jail for ${JAIL_SECONDS} seconds.`);
    this.ctx.fx({ kind: 'jail', x: cell.x, y: cell.y + 2, z: cell.z, who: target.sessionId });
  }

  private treat(c: Citizen, target: Citizen, close: boolean): void {
    if (c.profile.job !== 'medic' || !close || c.player.vehicle !== 0) return;
    const resting = target.player.pose === POSE.lie || target.player.emote === 10;
    if (!resting) {
      this.ctx.notify(c, 'info', 'Patients need to lie down (a hospital bed works best).');
      return;
    }
    const now = this.ctx.now();
    this.ctx.fx({ kind: 'heal', x: target.player.x, y: target.player.y + 2, z: target.player.z, who: target.sessionId });
    this.ctx.notify(target, 'good', `${visibleName(c.player.displayName)} treated you. You feel great!`);
    if (now - target.treatedAt < 60_000) {
      this.ctx.notify(c, 'info', 'Patient treated (no pay for the same patient so soon).');
      return;
    }
    target.treatedAt = now;
    addMoney(c, PAY.treatPlayer);
    c.profile.stats.treated += 1;
    this.ctx.notify(c, 'gold', `Patient treated! +$${PAY.treatPlayer}`);
  }

  struggle(c: Citizen): void {
    if (!(c.player.status & STATUS.cuffed)) return;
    c.struggle += 1;
    if (c.struggle >= STRUGGLES_TO_ESCAPE) {
      const officer = this.ctx.citizen(c.player.escort);
      this.uncuff(c, true);
      this.ctx.notify(c, 'good', 'You slipped out of the cuffs!');
      if (officer) this.ctx.notify(officer, 'bad', `${visibleName(c.player.displayName)} escaped!`);
    }
  }

  // ------------------------------------------------------------------ tick

  tick(c: Citizen): void {
    const now = this.ctx.now();
    const p = c.player;
    if (c.fishAt > 0 && now >= c.fishAt) {
      c.fishAt = 0;
      const [name, value] = FISH[Math.floor(this.ctx.random() * FISH.length)]!;
      addMoney(c, value);
      c.profile.stats.fish += 1;
      this.ctx.notify(c, 'gold', `You caught a ${name}! Sold for $${value}.`);
      this.ctx.fx({ kind: 'fish', x: p.x, y: p.y + 2, z: p.z, who: c.sessionId, data: value });
    }
    if (p.status & STATUS.jailed && now >= c.jailUntil) {
      p.status &= ~STATUS.jailed;
      c.immuneUntil = now + ARREST_IMMUNITY_SECONDS * 1000;
      const out = placeOf('police');
      this.ctx.place(c, out.x, out.y, out.z, out.yaw + Math.PI, 'release');
      this.ctx.notify(c, 'good', 'You are free to go. Stay out of trouble!');
    }
    if (p.status & STATUS.cuffed) {
      const officer = this.ctx.citizen(p.escort);
      if (!officer || officer.profile.job !== 'police') {
        this.uncuff(c, true);
        return;
      }
      if (officer.player.vehicle) {
        if (p.vehicle !== officer.player.vehicle && this.vehicles.hasFreeSeat(officer.player.vehicle)) {
          if (p.vehicle) this.vehicles.exit(c, true);
          this.vehicles.enter(c, officer.player.vehicle, false, true);
        }
      } else {
        if (p.vehicle) this.vehicles.exit(c, true);
        // Walk two paces behind the officer.
        const o = officer.player;
        const tx = o.x - Math.sin(o.rotationY) * 2.6;
        const tz = o.z - Math.cos(o.rotationY) * 2.6;
        const dx = tx - p.x;
        const dz = tz - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.2) {
          const k = d > 25 ? 1 : Math.min(1, 0.35);
          this.movement.hold(c.sessionId, p, p.x + dx * k, o.y, p.z + dz * k, Math.atan2(o.x - p.x, o.z - p.z));
          p.speed = d * 6;
        } else {
          p.speed = 0;
        }
      }
    }
  }

  /** A cuffed or jailed player cannot teleport, spawn or drive off. */
  inCustody(c: Citizen): boolean {
    return c.player.status !== 0;
  }

  /** The cash pop for a note on a piano or a guitar strum, for everyone nearby. */
  note(c: Citizen, note: number, instrument: 'piano' | 'guitar'): void {
    const now = this.ctx.now();
    if (now - c.lastNoteAt < 90) return;
    c.lastNoteAt = now;
    const n = Math.max(0, Math.min(15, Math.floor(note)));
    this.ctx.fx({ kind: 'note', x: c.player.x, y: c.player.y + 3, z: c.player.z, who: c.sessionId, data: n + (instrument === 'guitar' ? 100 : 0) } satisfies FxMessage);
  }
}
