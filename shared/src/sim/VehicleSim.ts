import type { VehicleDef } from '../config/vehicles.js';
import { WATER_Y, isLand } from '../world/layout.js';
import type { MovementInput, Obstacle } from './PlayerSim.js';
import type { MoveResult, WorldCollision } from './WorldCollision.js';

/**
 * EVERY VEHICLE ON ONE SIMULATION: arcade handling tuned per class, stepped
 * by the server (authority) and replayed by the driver's client
 * (prediction), deterministic like `PlayerSim`.
 *
 *   car / bike / board   drive on any floor; curbs are steps; drift with SPACE,
 *                        nitro with SHIFT
 *   boat                 the sea only, hull at the waterline
 *   heli                 hover: SPACE up, C down, W/S pitch, A/D turn
 *   plane                W/S throttle, roll out to take-off speed, SPACE to
 *                        pull up, C to dive, A/D to bank
 *
 * The body collides as three squares along its length (nose, middle, tail),
 * so a long car cannot slide its nose into a wall.
 */

export interface VehicleMotion {
  x: number;
  y: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  vy: number;
  grounded: boolean;
  /** Nitro tank 0..1. */
  nitro: number;
  /** Plane throttle 0..1. */
  throttle: number;
}

export interface VehicleParams {
  /** Fuel left: at zero the engine only limps. */
  fuel: number;
  /** This vehicle's id, so its own obstacle circles are ignored. */
  self: number;
}

export interface VehicleEvents {
  /** Speed of the hardest impact this step, 0 when none. */
  crash: number;
  landed: boolean;
  /** World units travelled (for fuel). */
  travelled: number;
}

export const createVehicleMotion = (x = 0, y = 0, z = 0, yaw = 0): VehicleMotion => ({ x, y, z, yaw, vx: 0, vz: 0, vy: 0, grounded: true, nitro: 1, throttle: 0 });
export const createVehicleEvents = (): VehicleEvents => ({ crash: 0, landed: false, travelled: 0 });

export const copyVehicleMotion = (from: VehicleMotion, to: VehicleMotion): void => {
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
  to.yaw = from.yaw;
  to.vx = from.vx;
  to.vz = from.vz;
  to.vy = from.vy;
  to.grounded = from.grounded;
  to.nitro = from.nitro;
  to.throttle = from.throttle;
};

/** Forward speed (signed). */
export const forwardSpeed = (m: VehicleMotion): number => m.vx * Math.sin(m.yaw) + m.vz * Math.cos(m.yaw);

/** Where a boat's base rides. */
export const BOAT_Y = WATER_Y - 0.5;

const GRAVITY = 60;
const AXIS: MoveResult = { value: 0, y: 0, hit: false };

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const approach = (v: number, target: number, rate: number): number => (v < target ? Math.min(target, v + rate) : Math.max(target, v - rate));

/** Half-width the body collides with, and how far the nose and tail circles sit from the middle. */
export const vehicleRadius = (def: VehicleDef): number => (def.class === 'plane' ? 1.8 : def.class === 'heli' ? 1.9 : Math.max(0.7, def.width / 2));
export const vehicleReach = (def: VehicleDef): number => Math.max(0, def.length / 2 - vehicleRadius(def));

/** The circles a vehicle's body pushes others with. */
export const vehicleObstacles = (def: VehicleDef, m: { x: number; y: number; z: number; yaw: number }, id: number, out: Obstacle[]): void => {
  const r = vehicleRadius(def);
  const reach = vehicleReach(def);
  const fx = Math.sin(m.yaw);
  const fz = Math.cos(m.yaw);
  const top = m.y + def.height;
  if (reach < 0.5) {
    out.push({ x: m.x, z: m.z, r, top, bottom: m.y, owner: id });
    return;
  }
  for (const k of [-1, 0, 1]) out.push({ x: m.x + fx * reach * k, z: m.z + fz * reach * k, r, top, bottom: m.y, owner: id });
};

/** Can the body stand here? Land vehicles need a floor, boats need open water, and nothing may overlap a wall. */
const bodyFits = (def: VehicleDef, collision: WorldCollision, x: number, y: number, z: number, yaw: number, stepUp: number): boolean => {
  const r = vehicleRadius(def);
  const reach = vehicleReach(def);
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const points = reach < 0.5 ? [0] : [-1, 1];
  for (const k of points) {
    const px = x + fx * reach * k;
    const pz = z + fz * reach * k;
    if (collision.blocked(px, y + stepUp + 0.02, pz, r * 0.92, Math.max(0.4, def.height - stepUp - 0.1))) return false;
    if (def.class === 'boat') {
      if (isLand(px, pz)) return false;
    } else if (def.class !== 'heli' && def.class !== 'plane') {
      const floor = collision.floorBelow(px, y + stepUp, pz, r * 0.5, 0.05);
      if (floor < -1) return false;
    }
  }
  return true;
};

const stepHeightOf = (def: VehicleDef, grounded: boolean): number => {
  switch (def.class) {
    case 'car':
      return 0.7;
    case 'bike':
      return 0.6;
    case 'board':
      return 0.4;
    case 'plane':
    case 'heli':
      return grounded ? 0.6 : 0;
    case 'boat':
      return 0;
  }
};

/**
 * Advance one vehicle by one step.
 */
export const stepVehicle = (
  m: VehicleMotion,
  input: MovementInput,
  def: VehicleDef,
  params: VehicleParams,
  delta: number,
  collision: WorldCollision,
  obstacles: readonly Obstacle[],
  events: VehicleEvents,
): void => {
  events.crash = 0;
  events.landed = false;
  events.travelled = 0;
  const dt = Number.isFinite(delta) ? clamp(delta, 0, 0.1) : 0;
  if (dt === 0) return;
  const h = def.handling;
  const hasFuel = def.fuelUse === 0 || params.fuel > 0;

  const fx = Math.sin(m.yaw);
  const fz = Math.cos(m.yaw);
  const rx = -Math.cos(m.yaw);
  const rz = Math.sin(m.yaw);
  let vf = m.vx * fx + m.vz * fz;
  let vs = m.vx * rx + m.vz * rz;
  const throttle = clamp(input.moveZ, -1, 1);
  const steer = clamp(input.moveX, -1, 1);

  if (def.class === 'heli') {
    stepHeli(m, input, def, hasFuel, dt);
  } else if (def.class === 'plane') {
    // Throttle is a lever: W pushes it up, S pulls it back.
    if (throttle > 0.1) m.throttle = Math.min(1, m.throttle + 0.7 * dt * throttle);
    else if (throttle < -0.1) m.throttle = Math.max(0, m.throttle + 0.9 * dt * throttle);
    const takeoff = h.takeoff ?? 45;
    const target = hasFuel ? m.throttle * h.maxSpeed : 0;
    if (m.grounded && throttle < -0.5 && m.throttle === 0 && vf < 1) vf = Math.max(-6, vf - 8 * dt);
    else vf = approach(vf, target, (target > vf ? h.accel : m.grounded ? h.brake : h.accel * 0.6) * dt);
    if (m.grounded) {
      m.yaw -= steer * h.steer * 1.6 * clamp(Math.abs(vf) / 10, 0, 1) * Math.sign(vf || 1) * dt;
      if (input.jump && vf >= takeoff) {
        m.grounded = false;
        m.vy = (h.climb ?? 20) * 0.6;
      }
    } else {
      m.yaw -= steer * h.steer * dt;
      const stall = takeoff * 0.7;
      if (vf < stall) {
        m.vy -= 24 * dt;
      } else {
        const climb = h.climb ?? 20;
        const want = (input.jump ? climb : 0) - (input.down ? climb * 1.3 : 0);
        m.vy = approach(m.vy, want, 26 * dt);
      }
    }
    vs = 0;
  } else {
    // Cars, bikes, boards and boats.
    const boatish = def.class === 'boat';
    const boosting = input.sprint && h.boost > 0 && m.nitro > 0.02 && throttle > 0.1 && hasFuel;
    const top = h.maxSpeed * (boosting ? 1.3 : 1);
    const power = hasFuel ? 1 : 0.18;
    if (throttle > 0.05) {
      if (vf < -0.8) vf = Math.min(0, vf + h.brake * throttle * dt);
      else vf += (h.accel * power * clamp(1 - (vf / top) * (vf / top), 0, 1) + (boosting ? h.boost : 0)) * throttle * dt;
    } else if (throttle < -0.05) {
      if (vf > 0.8) vf = Math.max(0, vf - h.brake * -throttle * dt);
      else vf -= h.accel * 0.7 * power * clamp(1 - (vf / h.reverseSpeed) * (vf / h.reverseSpeed), 0, 1) * -throttle * dt;
    } else {
      const drag = boatish ? 10 + Math.abs(vf) * 0.25 : 5 + Math.abs(vf) * 0.12;
      vf = approach(vf, 0, drag * dt);
    }
    if (vf > top) vf = approach(vf, top, h.accel * dt);
    if (vf < -h.reverseSpeed) vf = -h.reverseSpeed;
    if (boosting) m.nitro = Math.max(0, m.nitro - dt / 3.5);
    else m.nitro = Math.min(1, m.nitro + dt / 14);

    const handbrake = input.jump && !boatish;
    if (handbrake) vf = approach(vf, 0, h.brake * 0.45 * dt);
    const speed = Math.abs(vf);
    const minTurn = boatish ? 0.3 : 0;
    const factor = Math.max(minTurn, clamp(speed / 9, 0, 1)) * (1 - 0.45 * clamp(speed / h.maxSpeed, 0, 1)) * (handbrake ? 1.35 : 1);
    m.yaw -= steer * h.steer * factor * (vf < -0.5 ? -1 : 1) * dt;
    const grip = handbrake ? h.grip * 0.22 : h.grip;
    vs *= Math.exp(-grip * dt);
  }

  if (def.class !== 'heli') {
    const nfx = Math.sin(m.yaw);
    const nfz = Math.cos(m.yaw);
    const nrx = -Math.cos(m.yaw);
    const nrz = Math.sin(m.yaw);
    m.vx = nfx * vf + nrx * vs;
    m.vz = nfz * vf + nrz * vs;
  }

  // ------------------------------------------------------------- movement
  const r = vehicleRadius(def);
  const speedNow = Math.hypot(m.vx, m.vz, m.vy);
  const steps = Math.min(30, Math.max(1, Math.ceil((speedNow * dt) / 0.6)));
  const sh = dt / steps;
  const startX = m.x;
  const startZ = m.z;

  for (let i = 0; i < steps; i += 1) {
    const step = stepHeightOf(def, m.grounded);
    const ox = m.x;
    const oy = m.y;
    const oz = m.z;
    collision.moveAxis('x', m.x, m.y, m.z, m.vx * sh, r * 0.92, def.height, step, AXIS);
    const hitX = AXIS.hit;
    m.x = AXIS.value;
    m.y = AXIS.y;
    collision.moveAxis('z', m.x, m.y, m.z, m.vz * sh, r * 0.92, def.height, step, AXIS);
    const hitZ = AXIS.hit;
    m.z = AXIS.value;
    m.y = AXIS.y;
    collision.clampToBounds(m, r);

    if (hitX || hitZ || !bodyFits(def, collision, m.x, m.y, m.z, m.yaw, step)) {
      // Back to where we were, and bounce off whatever we hit.
      const impact = Math.hypot(m.vx, m.vz);
      m.x = ox;
      m.y = oy;
      m.z = oz;
      events.crash = Math.max(events.crash, impact);
      const along = m.vx * Math.sin(m.yaw) + m.vz * Math.cos(m.yaw);
      const keep = -0.18;
      m.vx = Math.sin(m.yaw) * along * keep;
      m.vz = Math.cos(m.yaw) * along * keep;
      if (def.class === 'plane') m.throttle = Math.min(m.throttle, 0.2);
      break;
    }

    // Vertical.
    if (def.class === 'boat') {
      m.y = BOAT_Y;
      m.vy = 0;
      m.grounded = true;
    } else if (def.class === 'heli' || def.class === 'plane') {
      const floor = collision.floorBelow(m.x, m.y + (m.grounded ? step : 0), m.z, r, 0.05, false);
      const ny = m.y + m.vy * sh;
      if (ny <= floor) {
        if (!m.grounded) events.landed = true;
        m.y = floor;
        if (m.vy < -32 && def.class === 'plane') events.crash = Math.max(events.crash, -m.vy);
        m.vy = 0;
        m.grounded = true;
      } else {
        const ceiling = collision.ceilingAbove(m.x, m.y + def.height, m.z, r);
        if (ny + def.height >= ceiling) {
          m.vy = Math.min(0, m.vy);
        } else {
          m.y = ny;
          if (ny > floor + 0.3) m.grounded = false;
        }
      }
      if (m.y > 420) {
        m.y = 420;
        m.vy = Math.min(0, m.vy);
      }
    } else {
      const floor = collision.floorBelow(m.x, m.y + step, m.z, r * 0.8, 0.05, false);
      if (m.grounded && m.y - floor <= step + 0.05 && m.y >= floor - 0.05) {
        m.y = floor;
        m.vy = 0;
      } else {
        m.vy -= GRAVITY * sh;
        const ny = m.y + m.vy * sh;
        if (ny <= floor) {
          if (!m.grounded) events.landed = true;
          m.y = floor;
          m.vy = 0;
          m.grounded = true;
        } else {
          m.y = ny;
          m.grounded = false;
        }
      }
    }
  }

  // Other vehicles push this one out.
  for (const o of obstacles) {
    if (o.owner === params.self) continue;
    if (m.y >= o.top || m.y + def.height <= o.bottom) continue;
    const reach = vehicleReach(def);
    const ks = reach < 0.5 ? [0] : [-1, 0, 1];
    for (const k of ks) {
      const cx = m.x + Math.sin(m.yaw) * reach * k;
      const cz = m.z + Math.cos(m.yaw) * reach * k;
      const dx = cx - o.x;
      const dz = cz - o.z;
      const min = o.r + r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 1e-3;
      const nx = d2 > 1e-6 ? dx / d : 1;
      const nz = d2 > 1e-6 ? dz / d : 0;
      const push = min - d;
      if (!collision.blocked(m.x + nx * push, m.y + 0.3, m.z + nz * push, r * 0.9, Math.max(0.4, def.height - 0.4))) {
        m.x += nx * push;
        m.z += nz * push;
      }
      const into = m.vx * nx + m.vz * nz;
      if (into < 0) {
        events.crash = Math.max(events.crash, -into);
        m.vx -= nx * into * 1.2;
        m.vz -= nz * into * 1.2;
      }
    }
  }

  events.travelled = Math.hypot(m.x - startX, m.z - startZ);
};

/** The helicopter: hovering, climbing, pitching forward to fly. */
const stepHeli = (m: VehicleMotion, input: MovementInput, def: VehicleDef, hasFuel: boolean, dt: number): void => {
  const h = def.handling;
  const climb = h.climb ?? 20;
  let want = (input.jump ? climb : 0) - (input.down ? climb : 0);
  if (!hasFuel) want = -6;
  if (m.grounded && want <= 0) {
    m.vy = 0;
    m.vx = approach(m.vx, 0, 30 * dt);
    m.vz = approach(m.vz, 0, 30 * dt);
    if (input.jump && hasFuel) m.grounded = false;
    if (m.grounded) {
      m.yaw -= clamp(input.moveX, -1, 1) * h.steer * 0.5 * dt;
      return;
    }
  }
  m.vy = approach(m.vy, want, 34 * dt);
  m.yaw -= clamp(input.moveX, -1, 1) * h.steer * dt;
  const fx = Math.sin(m.yaw);
  const fz = Math.cos(m.yaw);
  const thrust = clamp(input.moveZ, -1, 1) * (input.moveZ < 0 ? 0.6 : 1);
  m.vx += fx * thrust * h.accel * dt;
  m.vz += fz * thrust * h.accel * dt;
  const drag = Math.exp(-(thrust === 0 ? 1.2 : 0.35) * dt);
  m.vx *= drag;
  m.vz *= drag;
  // Sideways slide bleeds away.
  const rx = -Math.cos(m.yaw);
  const rz = Math.sin(m.yaw);
  const side = m.vx * rx + m.vz * rz;
  const kill = side * (1 - Math.exp(-h.grip * dt));
  m.vx -= rx * kill;
  m.vz -= rz * kill;
  const speed = Math.hypot(m.vx, m.vz);
  if (speed > h.maxSpeed) {
    m.vx *= h.maxSpeed / speed;
    m.vz *= h.maxSpeed / speed;
  }
};

/** Fuel burnt over a distance. */
export const fuelFor = (def: VehicleDef, distance: number): number => (def.fuelUse * distance) / 100;

/** Can a vehicle of this kind stand here (spawning, exits)? */
export const vehicleFits = (def: VehicleDef, collision: WorldCollision, x: number, y: number, z: number, yaw: number): boolean =>
  bodyFits(def, collision, x, y, z, yaw, stepHeightOf(def, true));

/** World position of a seat. */
export const seatWorld = (def: VehicleDef, m: { x: number; y: number; z: number; yaw: number }, seat: number): { x: number; y: number; z: number } => {
  const s = def.seats[seat] ?? def.seats[0]!;
  const c = Math.cos(m.yaw);
  const sn = Math.sin(m.yaw);
  return { x: m.x + s.x * c + s.z * sn, y: m.y + s.y, z: m.z - s.x * sn + s.z * c };
};
