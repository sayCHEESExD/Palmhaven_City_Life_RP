import {
  BOAT_Y,
  FREE_VEHICLES,
  FUEL_MAX,
  FUEL_PRICE,
  MessageType,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  POSE,
  ROADS,
  createVehicleEvents,
  createVehicleMotion,
  fuelFor,
  isAircraft,
  isBoat,
  jobById,
  roadRect,
  seatWorld,
  stepVehicle,
  vehicleById,
  vehicleFits,
  vehicleObstacles,
  vehicleRadius,
  visibleName,
  type MovementInput,
  type Obstacle,
  type VehicleActionKind,
  type VehicleDef,
  type VehicleEvents,
  type VehicleMotion,
} from '@palmhaven/shared';
import { VehicleState } from '../rooms/state/GameState.js';
import { spend, type Citizen } from './Citizen.js';
import type { RoomContext } from './RoomContext.js';
import type { MovementService } from '../movement/MovementService.js';

interface VehicleSim {
  readonly id: number;
  readonly def: VehicleDef;
  readonly state: VehicleState;
  readonly motion: VehicleMotion;
  readonly events: VehicleEvents;
  /** Session ids by seat ('' = free). */
  readonly seats: string[];
  crashAt: number;
}

const FLAG = { lights: 1, siren: 2, locked: 4 } as const;

/**
 * EVERY VEHICLE IN THE ROOM: spawning, seats, the driver's input, fuel, horn,
 * lights and sirens. The simulation itself is the shared `stepVehicle`; this
 * owns WHO may do WHAT with WHICH vehicle.
 *
 * One vehicle per player. It goes when they spawn another, clear it, or leave.
 */
export class VehicleService {
  private readonly sims = new Map<number, VehicleSim>();
  private nextId = 1;
  private readonly circles: Obstacle[] = [];
  private circlesStale = true;
  /** A passenger who rode a taxi stepped out. */
  onPassengerExit: ((passenger: Citizen, sim: { driver: string; travelled: number }) => void) | null = null;

  constructor(
    private readonly ctx: RoomContext,
    private readonly movement: MovementService,
  ) {}

  get count(): number {
    return this.sims.size;
  }

  stateOf(id: number): VehicleState | undefined {
    return this.sims.get(id)?.state;
  }

  defOf(id: number): VehicleDef | undefined {
    return this.sims.get(id)?.def;
  }

  /** Every vehicle body as circles. Rebuilt only when something moved. */
  obstacles(): readonly Obstacle[] {
    if (!this.circlesStale) return this.circles;
    this.circles.length = 0;
    for (const sim of this.sims.values()) vehicleObstacles(sim.def, sim.motion, sim.id, this.circles);
    this.circlesStale = false;
    return this.circles;
  }

  // ----------------------------------------------------------------- spawn

  /** May this citizen take this vehicle out? */
  canUse(c: Citizen, def: VehicleDef): string | null {
    if (def.hidden) return 'That vehicle is not available.';
    if (def.job) return c.profile.job === def.job ? null : `Only ${jobById(def.job)?.name ?? 'staff'}s can drive the ${def.name}.`;
    if (def.price === 0 || FREE_VEHICLES.includes(def.id) || c.profile.vehicles.includes(def.id)) return null;
    return `Buy the ${def.name} at Palm Motors first.`;
  }

  spawn(c: Citizen, kind: number, paint: number): void {
    const def = vehicleById(kind);
    if (!def) return;
    const refused = this.canUse(c, def);
    if (refused) {
      this.ctx.notify(c, 'bad', refused);
      return;
    }
    const now = this.ctx.now();
    if (now < c.spawnAt) return;
    if (c.player.vehicle !== 0) {
      this.ctx.notify(c, 'bad', 'Get out of your vehicle first.');
      return;
    }
    if (c.player.status !== 0) return;
    const spot = this.findSpot(def, c.player.x, c.player.y, c.player.z, c.player.rotationY, c.vehicle);
    if (!spot) {
      this.ctx.notify(
        c,
        'bad',
        isBoat(def)
          ? 'Boats launch from the water. Head to the marina or a dock!'
          : isAircraft(def)
            ? 'Not enough room to land an aircraft here. Try the airport!'
            : 'Not enough room here. Try an open road or parking lot.',
      );
      return;
    }
    if (c.vehicle) this.despawn(c.vehicle);
    c.spawnAt = now + 2500;

    const id = this.nextId++;
    const state = new VehicleState();
    state.id = id;
    state.kind = def.id;
    state.paint = def.paints.includes(paint) ? paint : def.paints[0]!;
    state.owner = c.sessionId;
    state.ownerName = visibleName(c.player.displayName);
    state.fuel = FUEL_MAX;
    const motion = createVehicleMotion(spot.x, spot.y, spot.z, spot.yaw);
    const sim: VehicleSim = { id, def, state, motion, events: createVehicleEvents(), seats: def.seats.map(() => ''), crashAt: 0 };
    this.sims.set(id, sim);
    this.publish(sim);
    this.ctx.state.vehicles.set(String(id), state);
    c.vehicle = id;
    c.dirty = true;
    this.ctx.notify(c, 'good', `Your ${def.name} is ready!`);
  }

  /**
   * A clear spot near (x, z): in front first, then around. Land vehicles need
   * a floor, boats need water, aircraft need room for wings and rotors.
   */
  findSpot(def: VehicleDef, x: number, y: number, z: number, yaw: number, ignore = 0): { x: number; y: number; z: number; yaw: number } | null {
    const collision = this.ctx.collision;
    const r = vehicleRadius(def);
    const boat = isBoat(def);
    const distances = boat ? [8, 14, 22, 32, 44, 58, 75] : [6 + def.length / 2, 9 + def.length / 2, 14 + def.length / 2, 22 + def.length / 2, 32 + def.length / 2];
    const angles = [0, 0.5, -0.5, 1.1, -1.1, 1.7, -1.7, 2.4, -2.4, Math.PI];
    // Cars and trucks go on the nearest road, in its right-hand lane, so they
    // can drive straight off - never wedged between a fountain and a wall.
    if (!boat && !isAircraft(def) && def.class !== 'board' && def.class !== 'bike') {
      const lanes: { x: number; z: number; yaw: number; d: number }[] = [];
      for (const road of ROADS) {
        const rr = roadRect(road);
        const ns = road.x0 === road.x1;
        const px = Math.max(rr.x0 + 4, Math.min(rr.x1 - 4, x));
        const pz = Math.max(rr.z0 + 4, Math.min(rr.z1 - 4, z));
        for (const side of [1, -1]) {
          // Right-hand traffic: heading south (yaw 0) keeps to -X, north to +X.
          const lx = ns ? (rr.x0 + rr.x1) / 2 - side * 5 : px;
          const lz = ns ? pz : (rr.z0 + rr.z1) / 2 + side * 5;
          const face = ns ? (side > 0 ? 0 : Math.PI) : side > 0 ? Math.PI / 2 : -Math.PI / 2;
          lanes.push({ x: lx, z: lz, yaw: face, d: Math.hypot(lx - x, lz - z) + (Math.abs(Math.atan2(Math.sin(face - yaw), Math.cos(face - yaw))) > 1.6 ? 3 : 0) });
        }
      }
      lanes.sort((a, b) => a.d - b.d);
      for (const lane of lanes) {
        if (lane.d > 34) break;
        for (const slide of [0, 8, -8, 16, -16]) {
          const cx = lane.x + Math.sin(lane.yaw) * slide;
          const cz = lane.z + Math.cos(lane.yaw) * slide;
          const cy = collision.floorBelow(cx, Math.max(y, 0.3) + 2.5, cz, r, 0.05, true);
          if (cy < -0.5 || cy > 1) continue;
          if (!vehicleFits(def, collision, cx, cy, cz, lane.yaw)) continue;
          if (this.overlapsVehicle(cx, cz, def.length / 2 + 1.5, ignore)) continue;
          return { x: cx, y: cy, z: cz, yaw: lane.yaw };
        }
      }
    }
    for (const d of distances) {
      for (const a of angles) {
        const cx = x + Math.sin(yaw + a) * d;
        const cz = z + Math.cos(yaw + a) * d;
        let face = yaw;
        // On a road, line up with it.
        for (const road of ROADS) {
          const rr = roadRect(road);
          if (cx < rr.x0 || cx > rr.x1 || cz < rr.z0 || cz > rr.z1) continue;
          const axis = road.x0 === road.x1 ? 0 : Math.PI / 2;
          const options = [axis, axis + Math.PI];
          face = options.reduce((best, o) => (Math.abs(Math.atan2(Math.sin(o - yaw), Math.cos(o - yaw))) < Math.abs(Math.atan2(Math.sin(best - yaw), Math.cos(best - yaw))) ? o : best), options[0]!);
          break;
        }
        let cy: number;
        if (boat) {
          cy = BOAT_Y;
        } else {
          cy = collision.floorBelow(cx, y + 2.5, cz, r, 0.05, true);
          if (cy < -0.5) continue;
        }
        if (!vehicleFits(def, collision, cx, cy, cz, face)) continue;
        // Room to drive off: the same footprint one length ahead must be clear too.
        if (!boat && !isAircraft(def) && !vehicleFits(def, collision, cx + Math.sin(face) * def.length, cy, cz + Math.cos(face) * def.length, face)) continue;
        if (def.class === 'plane' && collision.blockedRect(cx, cz, 10, 8, cy + 0.8, 5)) continue;
        if (def.class === 'heli' && collision.blockedRect(cx, cz, 7.5, 7.5, cy + 0.8, 5)) continue;
        if (this.overlapsVehicle(cx, cz, def.length / 2 + 1, ignore)) continue;
        return { x: cx, y: cy, z: cz, yaw: face };
      }
    }
    return null;
  }

  private overlapsVehicle(x: number, z: number, radius: number, ignore: number): boolean {
    for (const sim of this.sims.values()) {
      if (sim.id === ignore) continue;
      const reach = sim.def.length / 2 + radius;
      if (Math.hypot(sim.motion.x - x, sim.motion.z - z) < reach) return true;
    }
    return false;
  }

  /** Put it away: everyone gets out first. */
  despawn(id: number): void {
    const sim = this.sims.get(id);
    if (!sim) return;
    for (const sessionId of sim.seats) {
      if (!sessionId) continue;
      const c = this.ctx.citizen(sessionId);
      if (c) this.exit(c, true);
    }
    this.sims.delete(id);
    this.ctx.state.vehicles.delete(String(id));
    this.circlesStale = true;
    const owner = this.ctx.citizen(sim.state.owner);
    if (owner && owner.vehicle === id) {
      owner.vehicle = 0;
      owner.dirty = true;
    }
  }

  /** Everything a leaving player owns or sits in. */
  release(c: Citizen): void {
    if (c.player.vehicle) this.exit(c, true);
    if (c.vehicle) this.despawn(c.vehicle);
  }

  // ----------------------------------------------------------------- seats

  enter(c: Citizen, id: number, drive: boolean, force = false): boolean {
    const sim = this.sims.get(id);
    if (!sim || c.player.vehicle !== 0) return false;
    if (!force && (c.player.status !== 0 || c.player.pose !== POSE.stand)) return false;
    const reach = sim.def.length / 2 + 7;
    if (!force && Math.hypot(c.player.x - sim.motion.x, c.player.z - sim.motion.z) > reach) return false;
    const owner = sim.state.owner === c.sessionId;
    if (!owner && !force && (sim.state.flags & FLAG.locked) !== 0) {
      this.ctx.notify(c, 'bad', 'It\'s locked.');
      return false;
    }
    let seat = -1;
    if (drive && owner && !sim.seats[0]) seat = 0;
    if (seat < 0) {
      // The nearest free passenger seat (the owner may also take any free seat).
      let best = Infinity;
      sim.seats.forEach((who, index) => {
        if (who || (index === 0 && !owner)) return;
        const at = seatWorld(sim.def, sim.motion, index);
        const d = Math.hypot(at.x - c.player.x, at.z - c.player.z);
        if (d < best) {
          best = d;
          seat = index;
        }
      });
    }
    if (seat < 0) {
      if (!force) this.ctx.notify(c, 'bad', 'No free seats.');
      return false;
    }
    sim.seats[seat] = c.sessionId;
    c.player.vehicle = id;
    c.player.seat = seat;
    c.player.pose = POSE.stand;
    c.player.emote = 0;
    if (seat === 0) sim.state.driver = c.sessionId;
    const driver = sim.seats[0] ? this.ctx.citizen(sim.seats[0]) : undefined;
    if (seat !== 0 && driver?.profile.job === 'taxi' && sim.def.key === 'taxi') c.rideFrom = { x: sim.motion.x, z: sim.motion.z, vehicle: id };
    this.place(sim, c);
    c.dirty = true;
    return true;
  }

  /** Get out beside the door (or into the sea, off a boat with no dock). */
  exit(c: Citizen, force = false): void {
    const id = c.player.vehicle;
    const sim = this.sims.get(id);
    if (!sim) {
      c.player.vehicle = 0;
      c.player.seat = -1;
      return;
    }
    const speed = Math.hypot(sim.motion.vx, sim.motion.vz);
    if (!force && c.player.seat === 0 && (isAircraft(sim.def) && !sim.motion.grounded)) {
      this.ctx.notify(c, 'bad', 'Land first!');
      return;
    }
    if (!force && speed > 14 && !isBoat(sim.def)) {
      this.ctx.notify(c, 'bad', 'Slow down to get out!');
      return;
    }
    const seat = c.player.seat;
    if (seat >= 0 && sim.seats[seat] === c.sessionId) sim.seats[seat] = '';
    if (seat === 0) {
      sim.state.driver = '';
      // A parked vehicle stays put.
      sim.motion.vx = 0;
      sim.motion.vz = 0;
      if (!isAircraft(sim.def)) sim.motion.vy = 0;
      this.publish(sim);
    }
    c.player.vehicle = 0;
    c.player.seat = -1;
    const spot = this.exitSpot(sim, seat);
    this.ctx.place(c, spot.x, spot.y, spot.z, sim.motion.yaw, 'exit');
    if (c.rideFrom && c.rideFrom.vehicle === id) {
      const travelled = Math.hypot(sim.motion.x - c.rideFrom.x, sim.motion.z - c.rideFrom.z);
      this.onPassengerExit?.(c, { driver: sim.seats[0] ?? '', travelled });
    }
    c.rideFrom = null;
    c.dirty = true;
  }

  private exitSpot(sim: VehicleSim, seat: number): { x: number; y: number; z: number } {
    const def = sim.def;
    const s = def.seats[seat] ?? def.seats[0]!;
    const side = s.x >= 0 ? 1 : -1;
    const out = def.width / 2 + 1.8;
    const candidates: [number, number][] = [
      [side * out, s.z],
      [-side * out, s.z],
      [0, -(def.length / 2 + 2)],
      [0, def.length / 2 + 2],
      [side * (out + 3), s.z],
      [-side * (out + 3), s.z],
    ];
    const collision = this.ctx.collision;
    const c = Math.cos(sim.motion.yaw);
    const sn = Math.sin(sim.motion.yaw);
    let fallback: { x: number; y: number; z: number } | null = null;
    for (const [lx, lz] of candidates) {
      const x = sim.motion.x + lx * c + lz * sn;
      const z = sim.motion.z - lx * sn + lz * c;
      const y = collision.floorBelow(x, sim.motion.y + 3, z, PLAYER_RADIUS, 0.05);
      if (collision.blocked(x, y + 0.02, z, PLAYER_RADIUS, PLAYER_HEIGHT)) continue;
      if (y > -1) return { x, y, z };
      fallback ??= { x, y, z };
    }
    return fallback ?? { x: sim.motion.x, y: sim.motion.y + sim.def.height, z: sim.motion.z };
  }

  /** Everyone aboard rides with the vehicle. */
  private place(sim: VehicleSim, only?: Citizen): void {
    sim.seats.forEach((sessionId, seat) => {
      if (!sessionId) return;
      const c = only && only.sessionId === sessionId ? only : only ? undefined : this.ctx.citizen(sessionId);
      if (!c) return;
      const at = seatWorld(sim.def, sim.motion, seat);
      this.movement.hold(sessionId, c.player, at.x, at.y, at.z, sim.motion.yaw);
      c.player.speed = Math.hypot(sim.motion.vx, sim.motion.vz);
    });
  }

  // ------------------------------------------------------------- driving

  /** The driver's input, from `MovementService`. */
  drive(sessionId: string, input: MovementInput, dt: number): boolean {
    const c = this.ctx.citizen(sessionId);
    if (!c) return false;
    const sim = this.sims.get(c.player.vehicle);
    if (!sim || sim.seats[0] !== sessionId) return false;
    this.ctx.collision.mover = '';
    stepVehicle(sim.motion, input, sim.def, { fuel: sim.state.fuel, self: sim.id }, dt, this.ctx.collision, this.obstacles(), sim.events);
    if (sim.def.fuelUse > 0 && sim.events.travelled > 0) {
      const before = sim.state.fuel;
      sim.state.fuel = Math.max(0, sim.state.fuel - fuelFor(sim.def, sim.events.travelled));
      if (before > 15 && sim.state.fuel <= 15) this.ctx.notify(c, 'info', 'Low fuel! Refill at Sun Fuel, the marina or the airport.');
      if (before > 0 && sim.state.fuel <= 0) this.ctx.notify(c, 'bad', 'Out of fuel! Push on slowly to a pump.');
    }
    const now = this.ctx.now();
    if (sim.events.crash > 22 && now - sim.crashAt > 600) {
      sim.crashAt = now;
      this.ctx.fx({ kind: 'crash', x: sim.motion.x, y: sim.motion.y + 1, z: sim.motion.z, data: Math.min(100, Math.round(sim.events.crash)) });
    }
    this.publish(sim);
    this.place(sim);
    return true;
  }

  private publish(sim: VehicleSim): void {
    const s = sim.state;
    const m = sim.motion;
    s.x = m.x;
    s.y = m.y;
    s.z = m.z;
    s.yaw = m.yaw;
    s.vx = m.vx;
    s.vz = m.vz;
    s.vy = m.vy;
    s.grounded = m.grounded;
    s.nitro = m.nitro;
    s.throttle = m.throttle;
    this.circlesStale = true;
  }

  // ------------------------------------------------------------- controls

  action(c: Citizen, action: VehicleActionKind): void {
    const sim = this.sims.get(c.player.vehicle);
    if (action === 'lock') {
      const own = this.sims.get(c.vehicle);
      if (!own) return;
      own.state.flags ^= FLAG.locked;
      this.ctx.notify(c, 'info', own.state.flags & FLAG.locked ? 'Vehicle locked.' : 'Vehicle unlocked.');
      return;
    }
    if (!sim || sim.seats[0] !== c.sessionId) return;
    switch (action) {
      case 'lights':
        sim.state.flags ^= FLAG.lights;
        return;
      case 'siren':
        if (sim.def.siren) sim.state.flags ^= FLAG.siren;
        return;
      case 'horn': {
        const now = this.ctx.now();
        if (now - c.lastHornAt < 350) return;
        c.lastHornAt = now;
        sim.state.horn = (sim.state.horn + 1) % 65535;
        return;
      }
    }
  }

  /** Fill up your own vehicle at a pump. Job vehicles fill for free. */
  refuel(c: Citizen, pumpX: number, pumpZ: number): void {
    const sim = this.sims.get(c.vehicle);
    if (!sim || sim.def.fuelUse === 0) {
      this.ctx.notify(c, 'info', 'Bring your vehicle up to the pump.');
      return;
    }
    if (Math.hypot(sim.motion.x - pumpX, sim.motion.z - pumpZ) > sim.def.length / 2 + 12) {
      this.ctx.notify(c, 'info', `Park your ${sim.def.name} next to the pump.`);
      return;
    }
    const needed = Math.ceil(FUEL_MAX - sim.state.fuel);
    if (needed <= 0) {
      this.ctx.notify(c, 'info', 'The tank is already full.');
      return;
    }
    const cost = sim.def.job ? 0 : needed * FUEL_PRICE;
    if (!spend(c, cost)) {
      this.ctx.notify(c, 'bad', `Fuel costs $${cost}. Not enough money!`);
      return;
    }
    sim.state.fuel = FUEL_MAX;
    this.ctx.notify(c, 'good', cost > 0 ? `Filled up for $${cost}.` : 'Filled up. The city pays for job vehicles!');
    this.ctx.send(c, MessageType.Fx, { kind: 'cash', x: pumpX, y: c.player.y + 2, z: pumpZ, data: -cost });
  }

  /** The vehicle a citizen is in, if they drive it. */
  drivenBy(c: Citizen): { id: number; def: VehicleDef; state: VehicleState; speed: number } | null {
    const sim = this.sims.get(c.player.vehicle);
    if (!sim || sim.seats[0] !== c.sessionId) return null;
    return { id: sim.id, def: sim.def, state: sim.state, speed: Math.hypot(sim.motion.vx, sim.motion.vz) };
  }

  /** Free seats in a vehicle, for escorting a cuffed passenger. */
  hasFreeSeat(id: number): boolean {
    const sim = this.sims.get(id);
    return !!sim && sim.seats.some((who, i) => i > 0 && !who);
  }

  /** Occupants by seat. */
  occupants(id: number): readonly string[] {
    return this.sims.get(id)?.seats ?? [];
  }

  /** Per tick: driverless aircraft settle, everyone aboard follows. */
  tick(): void {
    for (const sim of this.sims.values()) {
      if (sim.seats[0]) continue;
      if (!sim.motion.grounded && !isBoat(sim.def)) {
        const floor = this.ctx.collision.floorBelow(sim.motion.x, sim.motion.y, sim.motion.z, vehicleRadius(sim.def), 0.05, false);
        sim.motion.y = floor;
        sim.motion.vy = 0;
        sim.motion.grounded = true;
        sim.motion.vx = 0;
        sim.motion.vz = 0;
        this.publish(sim);
        this.place(sim);
      }
    }
  }
}
