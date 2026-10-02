import { JUMP_VELOCITY, MOVEMENT, RUN_SPEED, SWIM_SPEED, WALK_SPEED } from '../config/movement.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../constants/world.js';
import { rotateTowards } from '../types/math.js';
import { SWIM_Y } from '../world/layout.js';
import type { MoveResult, WorldCollision } from './WorldCollision.js';

/**
 * THE ON-FOOT SIMULATION, shared by the server and by client prediction.
 *
 * The server runs it to own the result and the client runs the identical
 * function to predict ahead of the network, so the two can only disagree
 * through inputs, never through maths. Walking, running, jumping, and
 * swimming wherever the ground gives way to the sea.
 */

export interface PlayerMotion {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  grounded: boolean;
  swimming: boolean;
  /** Edge-detect for the jump control, so a hold is one jump. */
  jumpLatched: boolean;
  /** Monotonic count of jumps, so a remote can mirror them. */
  jumpCount: number;
}

/**
 * One frame of intent. Carries no position - only what was pressed. The same
 * input drives a vehicle when the player is in a driver's seat.
 */
export interface MovementInput {
  /** -1..1: strafe on foot, steer in a vehicle. */
  moveX: number;
  /** -1..1: forward on foot, throttle in a vehicle. */
  moveZ: number;
  /** Space: jump, handbrake, climb. */
  jump: boolean;
  /** Shift: run, nitro. */
  sprint: boolean;
  /** C / Ctrl: descend (aircraft). */
  down: boolean;
  cameraYaw: number;
}

/** A soft round obstacle (a vehicle's body, in a few circles). */
export interface Obstacle {
  readonly x: number;
  readonly z: number;
  readonly r: number;
  readonly top: number;
  readonly bottom: number;
  /** The vehicle it belongs to, so it can ignore itself. */
  readonly owner: number;
}

export interface SimParams {
  walkSpeed: number;
  runSpeed: number;
  jumpVelocity: number;
  radius: number;
}

export interface SimEvents {
  jumped: boolean;
  landed: boolean;
  splashed: boolean;
}

/** Largest single step the simulation will take, in seconds. */
export const MAX_SIM_DELTA = 0.1;

export const createMotion = (x = 0, y = 0, z = 0, yaw = 0): PlayerMotion => ({
  x,
  y,
  z,
  vx: 0,
  vy: 0,
  vz: 0,
  yaw,
  grounded: true,
  swimming: false,
  jumpLatched: false,
  jumpCount: 0,
});

export const createSimEvents = (): SimEvents => ({ jumped: false, landed: false, splashed: false });

export const createSimParams = (): SimParams => ({ walkSpeed: WALK_SPEED, runSpeed: RUN_SPEED, jumpVelocity: JUMP_VELOCITY, radius: PLAYER_RADIUS });

export const copyMotion = (from: PlayerMotion, to: PlayerMotion): void => {
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
  to.vx = from.vx;
  to.vy = from.vy;
  to.vz = from.vz;
  to.yaw = from.yaw;
  to.grounded = from.grounded;
  to.swimming = from.swimming;
  to.jumpLatched = from.jumpLatched;
  to.jumpCount = from.jumpCount;
};

/** Reset to a placement. */
export const resetMotion = (motion: PlayerMotion, x: number, y: number, z: number, yaw: number): void => {
  motion.x = x;
  motion.y = y;
  motion.z = z;
  motion.vx = 0;
  motion.vy = 0;
  motion.vz = 0;
  motion.yaw = yaw;
  motion.grounded = true;
  motion.swimming = y < SWIM_Y + 0.5;
  motion.jumpLatched = false;
};

export const horizontalSpeed = (motion: PlayerMotion): number => Math.hypot(motion.vx, motion.vz);

/** Sanitise one input before it is simulated. Applied on the SERVER. */
export const sanitiseInput = (input: Partial<MovementInput> | undefined): MovementInput => {
  const finite = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  let moveX = finite(input?.moveX);
  let moveZ = finite(input?.moveZ);
  const magnitude = Math.hypot(moveX, moveZ);
  if (magnitude > 1) {
    moveX /= magnitude;
    moveZ /= magnitude;
  }
  return { moveX, moveZ, jump: input?.jump === true, sprint: input?.sprint === true, down: input?.down === true, cameraYaw: finite(input?.cameraYaw) };
};

const AXIS: MoveResult = { value: 0, y: 0, hit: false };

/**
 * Advance one person on foot by one step.
 */
export const stepPlayer = (
  motion: PlayerMotion,
  input: MovementInput,
  params: SimParams,
  delta: number,
  collision: WorldCollision,
  events: SimEvents,
  obstacles: readonly Obstacle[] = [],
): void => {
  events.jumped = false;
  events.landed = false;
  events.splashed = false;
  const dt = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), MAX_SIM_DELTA) : 0;
  if (dt === 0) return;

  const pressed = input.jump && !motion.jumpLatched;
  motion.jumpLatched = input.jump;

  // Camera-relative stick: forward is where the camera looks, right is -X at yaw 0.
  const yaw = input.cameraYaw;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = -Math.cos(yaw);
  const rz = Math.sin(yaw);
  const wishX = rx * input.moveX + fx * input.moveZ;
  const wishZ = rz * input.moveX + fz * input.moveZ;
  const wishLength = Math.hypot(wishX, wishZ);

  const swimming = motion.swimming;
  const speed = swimming ? SWIM_SPEED : input.sprint ? Math.max(0, params.runSpeed) : Math.max(0, params.walkSpeed);
  const targetX = wishX * speed;
  const targetZ = wishZ * speed;
  const control = motion.grounded || swimming ? 1 : MOVEMENT.airControl;
  const rate = (wishLength > 0.01 ? MOVEMENT.acceleration : MOVEMENT.deceleration) * control * (swimming ? 0.45 : 1);
  const dvx = targetX - motion.vx;
  const dvz = targetZ - motion.vz;
  const dv = Math.hypot(dvx, dvz);
  const maxChange = rate * dt;
  if (dv <= maxChange) {
    motion.vx = targetX;
    motion.vz = targetZ;
  } else {
    motion.vx += (dvx / dv) * maxChange;
    motion.vz += (dvz / dv) * maxChange;
  }

  if (wishLength > 0.05) {
    motion.yaw = rotateTowards(motion.yaw, Math.atan2(wishX, wishZ), MOVEMENT.turnSpeed * dt);
  }

  if (pressed && motion.grounded) {
    // A hop out of the water is a small one: enough to climb onto a dock.
    motion.vy = swimming ? params.jumpVelocity * 0.75 : params.jumpVelocity;
    motion.grounded = false;
    motion.jumpCount += 1;
    events.jumped = true;
  }

  motion.vy = Math.max(motion.vy - MOVEMENT.gravity * dt, -MOVEMENT.terminalVelocity);

  const travel = Math.max(Math.abs(motion.vx), Math.abs(motion.vz), Math.abs(motion.vy)) * dt;
  const steps = Math.min(MOVEMENT.maxSubsteps, Math.max(1, Math.ceil(travel / MOVEMENT.maxSubstepDistance)));
  const h = dt / steps;
  const wasGrounded = motion.grounded;
  const radius = Number.isFinite(params.radius) && params.radius > 0 ? Math.min(params.radius, 4) : PLAYER_RADIUS;
  const step = swimming ? MOVEMENT.swimStep : MOVEMENT.stepHeight;
  let grounded = false;

  for (let i = 0; i < steps; i += 1) {
    collision.moveAxis('x', motion.x, motion.y, motion.z, motion.vx * h, radius, PLAYER_HEIGHT, step, AXIS);
    if (AXIS.hit) motion.vx = 0;
    motion.x = AXIS.value;
    motion.y = AXIS.y;
    collision.moveAxis('z', motion.x, motion.y, motion.z, motion.vz * h, radius, PLAYER_HEIGHT, step, AXIS);
    if (AXIS.hit) motion.vz = 0;
    motion.z = AXIS.value;
    motion.y = AXIS.y;
    collision.clampToBounds(motion, radius);

    const nextY = motion.y + motion.vy * h;
    if (motion.vy <= 0) {
      const floor = collision.floorBelow(motion.x, motion.y, motion.z, radius, 1e-3);
      // Walking down a curb stays on the ground rather than hopping off it.
      const snap = wasGrounded && !events.jumped && motion.y - floor <= MOVEMENT.stepHeight + 0.05 && motion.y - floor >= 0;
      // Rising out of the sea onto the shore.
      const climb = floor > motion.y && floor - motion.y <= step + 0.05;
      if (nextY <= floor || snap || climb) {
        motion.y = floor;
        motion.vy = 0;
        grounded = true;
      } else {
        motion.y = nextY;
      }
    } else {
      const ceiling = collision.ceilingAbove(motion.x, motion.y + PLAYER_HEIGHT, motion.z, radius);
      if (nextY + PLAYER_HEIGHT >= ceiling) {
        motion.y = ceiling - PLAYER_HEIGHT;
        motion.vy = 0;
      } else {
        motion.y = nextY;
      }
    }
  }

  if (!grounded && motion.vy <= 0) {
    const floor = collision.floorBelow(motion.x, motion.y, motion.z, radius, 0.05);
    if (motion.y - floor <= 0.05) {
      motion.y = floor;
      motion.vy = 0;
      grounded = true;
    }
  }

  // Bodies of vehicles push people aside.
  for (const o of obstacles) {
    if (motion.y >= o.top - 0.2 || motion.y + PLAYER_HEIGHT <= o.bottom) continue;
    const dx = motion.x - o.x;
    const dz = motion.z - o.z;
    const min = o.r + radius * 0.8;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min) continue;
    const d = Math.sqrt(d2) || 1e-3;
    const push = min - d;
    const nx = d2 > 1e-6 ? dx / d : 1;
    const nz = d2 > 1e-6 ? dz / d : 0;
    const tx = motion.x + nx * push;
    const tz = motion.z + nz * push;
    if (!collision.blocked(tx, motion.y + 0.05, tz, radius, PLAYER_HEIGHT - 0.1)) {
      motion.x = tx;
      motion.z = tz;
    }
  }

  const wasSwimming = motion.swimming;
  motion.swimming = grounded && motion.y <= SWIM_Y + 0.05;
  if (motion.swimming && !wasSwimming) events.splashed = true;
  motion.grounded = grounded;
  if (grounded && !wasGrounded) events.landed = true;
};
