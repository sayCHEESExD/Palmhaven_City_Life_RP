import {
  HOUSE_STYLES,
  HOUSE_STYLE_LIST,
  PLAYER_RADIUS,
  city,
  cityPlan,
  furnitureProblem,
  furnitureSolids,
  insideDoor,
  insideHouse,
  propById,
  propByKey,
  propFootprint,
  quarter,
  quarterYaw,
  seatsOfPiece,
  snapHalf,
  houseToWorld,
  visibleName,
  type FurnitureSeat,
  type HousePlot,
  type PlaceFurnitureMessage,
} from '@palmhaven/shared';
import { FurnitureState, type HouseState } from '../rooms/state/GameState.js';
import type { FurnitureRecord } from '../persistence/index.js';
import { near, spend, type Citizen } from './Citizen.js';
import type { RoomContext } from './RoomContext.js';

/**
 * HOMES: buying a style, moving into a free home of it, locking the door,
 * and the furniture inside.
 *
 * A home's furniture is public schema (everybody sees your living room) and
 * collision (everybody bumps into your sofa); it is saved to the OWNER's
 * profile per style when they save or leave.
 */
export class HouseService {
  private readonly plots: readonly HousePlot[] = cityPlan().houses;
  private nextFid = 1;

  constructor(private readonly ctx: RoomContext) {}

  private stateOf(id: number): HouseState | undefined {
    return this.ctx.state.houses[id];
  }

  plot(id: number): HousePlot | undefined {
    return this.plots[id];
  }

  /** Move in on join: the home they had last time if it is free here. */
  autoClaim(c: Citizen): void {
    const id = c.profile.lastHouse;
    const plot = this.plots[id];
    const state = this.stateOf(id);
    if (!plot || !state || state.owner) return;
    if (!c.profile.houseStyles.includes(HOUSE_STYLES[plot.style].index)) return;
    this.occupy(c, id);
  }

  claim(c: Citizen, id: number, teleport: boolean): void {
    const plot = this.plots[id];
    const state = this.stateOf(id);
    if (!plot || !state) return;
    if (state.owner === c.sessionId) {
      if (teleport) this.goHome(c);
      return;
    }
    if (state.owner) {
      this.ctx.notify(c, 'bad', `${state.ownerName || 'Someone'} already lives there.`);
      return;
    }
    const style = HOUSE_STYLES[plot.style];
    if (!c.profile.houseStyles.includes(style.index)) {
      this.ctx.notify(c, 'info', `Buy a ${style.name} first ($${style.price.toLocaleString('en-US')}).`);
      return;
    }
    this.occupy(c, id);
    this.ctx.notify(c, 'gold', `Welcome home to ${plot.address}!`);
    if (teleport) this.goHome(c);
  }

  buy(c: Citizen, id: number, teleport: boolean): void {
    const plot = this.plots[id];
    const state = this.stateOf(id);
    if (!plot || !state) return;
    const style = HOUSE_STYLES[plot.style];
    if (c.profile.houseStyles.includes(style.index)) {
      this.claim(c, id, teleport);
      return;
    }
    if (state.owner) {
      this.ctx.notify(c, 'bad', 'Someone lives there. Pick a free home of this style!');
      return;
    }
    if (!spend(c, style.price)) {
      this.ctx.notify(c, 'bad', `A ${style.name} costs $${style.price.toLocaleString('en-US')}.`);
      return;
    }
    c.profile.houseStyles.push(style.index);
    c.profile.houseStyles.sort((a, b) => a - b);
    this.ctx.fx({ kind: 'confetti', x: plot.x, y: plot.base + 4, z: plot.z, who: c.sessionId });
    this.occupy(c, id);
    this.ctx.notify(c, 'gold', `You bought a ${style.name}! Welcome home.`);
    this.ctx.persist(c);
    if (teleport) this.goHome(c);
  }

  private occupy(c: Citizen, id: number): void {
    if (c.player.house >= 0) this.leave(c, true);
    const plot = this.plots[id]!;
    const state = this.stateOf(id)!;
    const style = HOUSE_STYLES[plot.style];
    state.owner = c.sessionId;
    state.ownerName = visibleName(c.player.displayName);
    state.locked = false;
    state.furniture.clear();
    const saved = c.profile.homes[String(style.index)];
    const records: FurnitureRecord[] = saved ?? style.starter.map((p) => ({ kind: propByKey(p.key).id, x: p.x, z: p.z, rot: quarter(Math.round(p.rot / (Math.PI / 2))) }));
    for (const r of records) {
      const piece = new FurnitureState();
      piece.id = this.nextFid++;
      piece.kind = r.kind;
      piece.x = r.x;
      piece.z = r.z;
      piece.rot = quarter(r.rot);
      state.furniture.set(String(piece.id), piece);
    }
    if (!saved) c.profile.homes[String(style.index)] = records;
    c.player.house = id;
    c.profile.lastHouse = id;
    c.dirty = true;
    this.syncCollision(id);
  }

  /** Move out (or leave the server): the layout goes back into the profile. */
  leave(c: Citizen, quiet = false): void {
    const id = c.player.house;
    const state = this.stateOf(id);
    const plot = this.plots[id];
    if (!state || !plot || state.owner !== c.sessionId) {
      c.player.house = -1;
      return;
    }
    this.snapshot(c);
    state.owner = '';
    state.ownerName = '';
    state.locked = false;
    state.furniture.clear();
    c.player.house = -1;
    c.dirty = true;
    this.syncCollision(id);
    if (!quiet) this.ctx.notify(c, 'info', `You moved out of ${plot.address}.`);
  }

  /** Copy the live layout into the profile (before every save). */
  snapshot(c: Citizen): void {
    const id = c.player.house;
    const state = this.stateOf(id);
    const plot = this.plots[id];
    if (!state || !plot || state.owner !== c.sessionId) return;
    const records: FurnitureRecord[] = [];
    state.furniture.forEach((piece) => records.push({ kind: piece.kind, x: piece.x, z: piece.z, rot: piece.rot }));
    c.profile.homes[String(HOUSE_STYLES[plot.style].index)] = records;
  }

  lock(c: Citizen, locked: boolean): void {
    const state = this.stateOf(c.player.house);
    if (!state || state.owner !== c.sessionId) return;
    state.locked = locked;
    this.syncCollision(state.id);
    this.ctx.notify(c, 'info', locked ? 'Front door locked.' : 'Front door unlocked.');
    this.ctx.fx({ kind: 'door', x: this.plots[state.id]!.x, y: 2, z: this.plots[state.id]!.z, data: locked ? 1 : 0 });
  }

  goHome(c: Citizen): boolean {
    const plot = this.plots[c.player.house];
    if (!plot) return false;
    const b = city().plan.buildings[plot.building]!;
    const at = insideDoor(b, 3.5);
    this.ctx.place(c, at.x, plot.base, at.z, at.yaw, 'teleport');
    return true;
  }

  // ------------------------------------------------------------- furniture

  place(c: Citizen, m: PlaceFurnitureMessage): void {
    const id = c.player.house;
    const plot = this.plots[id];
    const state = this.stateOf(id);
    if (!plot || !state || state.owner !== c.sessionId) return;
    if (!insideHouse(plot, c.player.x, c.player.z, -2)) {
      this.ctx.notify(c, 'bad', 'Go inside your home to decorate.');
      return;
    }
    const x = snapHalf(Number(m?.x));
    const z = snapHalf(Number(m?.z));
    const rot = quarter(Number(m?.rot));
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const moving = typeof m?.fid === 'number' ? state.furniture.get(String(m.fid)) : undefined;
    const kind = moving ? moving.kind : Math.floor(Number(m?.kind));
    const pieces = [...state.furniture.values()].map((p) => ({ id: p.id, kind: p.kind, x: p.x, z: p.z, rot: p.rot }));
    const problem = furnitureProblem(plot, pieces, kind, x, z, rot, moving ? moving.id : -1);
    if (problem) {
      this.ctx.notify(c, 'bad', problem);
      return;
    }
    const def = propById(kind)!;
    if (def.solid && this.someoneInTheWay(plot, kind, x, z, rot)) {
      this.ctx.notify(c, 'bad', 'Someone is standing there!');
      return;
    }
    if (moving) {
      moving.x = x;
      moving.z = z;
      moving.rot = rot;
    } else {
      const stack = c.profile.furniture.find((s) => s.id === kind);
      if (!stack || stack.count <= 0) {
        this.ctx.notify(c, 'bad', `Buy a ${def.name} at Casa Home first.`);
        return;
      }
      if (stack.count <= 1) c.profile.furniture.splice(c.profile.furniture.indexOf(stack), 1);
      else (stack as { count: number }).count = stack.count - 1;
      const piece = new FurnitureState();
      piece.id = this.nextFid++;
      piece.kind = kind;
      piece.x = x;
      piece.z = z;
      piece.rot = rot;
      state.furniture.set(String(piece.id), piece);
    }
    c.dirty = true;
    this.syncCollision(id);
  }

  remove(c: Citizen, fid: number): void {
    const id = c.player.house;
    const state = this.stateOf(id);
    if (!state || state.owner !== c.sessionId) return;
    const piece = state.furniture.get(String(fid));
    if (!piece) return;
    // Anyone sitting on it stands up first.
    for (const other of this.ctx.citizens()) {
      if (other.seatKey.startsWith(`f:${id}:${fid}:`)) this.onPieceGone?.(other);
    }
    state.furniture.delete(String(fid));
    const stack = c.profile.furniture.find((s) => s.id === piece.kind);
    if (stack) (stack as { count: number }).count = Math.min(99, stack.count + 1);
    else c.profile.furniture.push({ id: piece.kind, count: 1 });
    c.dirty = true;
    this.syncCollision(id);
  }

  /** Stands a sitter up when the piece under them is picked up. */
  onPieceGone: ((c: Citizen) => void) | null = null;

  private someoneInTheWay(plot: HousePlot, kind: number, x: number, z: number, rot: number): boolean {
    const def = propById(kind)!;
    const at = houseToWorld(plot, x, z);
    const f = propFootprint(def, { x: at.x, z: at.z, rot: plot.rot + quarterYaw(rot) });
    for (const c of this.ctx.citizens()) {
      const r = PLAYER_RADIUS;
      if (c.player.vehicle) continue;
      if (c.player.x + r > f.minX && c.player.x - r < f.maxX && c.player.z + r > f.minZ && c.player.z - r < f.maxZ) return true;
    }
    return false;
  }

  /** A seat on a piece of furniture in somebody's home. */
  furnitureSeat(house: number, fid: number, index: number): FurnitureSeat | null {
    const plot = this.plots[house];
    const state = this.stateOf(house);
    const piece = state?.furniture.get(String(fid));
    if (!plot || !piece) return null;
    return seatsOfPiece(plot, { id: piece.id, kind: piece.kind, x: piece.x, z: piece.z, rot: piece.rot })[index] ?? null;
  }

  /** Furniture collision and the locked door, rebuilt for one home. */
  private syncCollision(id: number): void {
    const plot = this.plots[id];
    const state = this.stateOf(id);
    if (!plot || !state) return;
    const pieces = [...state.furniture.values()].map((p) => ({ id: p.id, kind: p.kind, x: p.x, z: p.z, rot: p.rot }));
    this.ctx.collision.setGroup(`furn:${id}`, furnitureSolids(plot, pieces));
    const doors = city().doors.filter((d) => d.house === id);
    this.ctx.collision.setGroup(
      `door:${id}`,
      state.locked
        ? doors.map((d) => {
            const half = d.width / 2;
            const sideways = Math.abs(Math.sin(d.rot)) > 0.5;
            return sideways
              ? { minX: d.x - 0.5, maxX: d.x + 0.5, minY: d.y, maxY: d.y + d.height, minZ: d.z - half, maxZ: d.z + half }
              : { minX: d.x - half, maxX: d.x + half, minY: d.y, maxY: d.y + d.height, minZ: d.z - 0.5, maxZ: d.z + 0.5 };
          })
        : [],
      state.owner || null,
    );
  }

  /** The house id a player is standing in, or -1. */
  houseAt(x: number, z: number): number {
    for (const plot of this.plots) if (insideHouse(plot, x, z)) return plot.id;
    return -1;
  }

  /** Is this citizen near their house's door or inside it? */
  nearHome(c: Citizen, id: number): boolean {
    const plot = this.plots[id];
    return !!plot && near(c, plot.x, plot.z, Math.max(HOUSE_STYLES[plot.style].w, HOUSE_STYLES[plot.style].d) + 10);
  }

  static readonly styles = HOUSE_STYLE_LIST;
}
