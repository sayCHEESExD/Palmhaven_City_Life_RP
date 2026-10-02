import {
  MAX_SIM_DELTA,
  POSE,
  STATUS,
  WorldCollision,
  createMotion,
  createSimEvents,
  createSimParams,
  horizontalSpeed,
  resetMotion,
  sanitiseInput,
  stepPlayer,
  type MoveMessage,
  type MovementInput,
  type Obstacle,
  type PlayerMotion,
  type SimEvents,
  type SimParams,
} from '@palmhaven/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';

/** Simulated seconds a client may bank per real second. */
const MAX_TIME_BUDGET_RATIO = 1.5;
/** Seconds of simulated time a fresh client starts with, to absorb bursts. */
const INITIAL_BUDGET = 0.5;
/** Largest jump in sequence number the server will follow. */
const MAX_SEQ_JUMP = 600;

interface Sim {
  motion: PlayerMotion;
  events: SimEvents;
  params: SimParams;
  lastSeq: number;
  budget: number;
  lastRefill: number;
}

/** What to do with one accepted input when the player is not on foot. */
export interface InputRouter {
  /** Drive a vehicle. True when the input was consumed by a vehicle. */
  drive(sessionId: string, input: MovementInput, dt: number): boolean;
  /** The circles of every vehicle body, for pushing people aside. */
  obstacles(): readonly Obstacle[];
  /** A seated player pressed jump: stand them up. */
  standUp(sessionId: string): void;
}

/**
 * SERVER-AUTHORITATIVE MOVEMENT.
 *
 * The client sends INPUT and nothing else. On foot, this runs the shared
 * `stepPlayer` and the result becomes the player's transform; in a driver's
 * seat the same input is routed to the vehicle (`InputRouter.drive`), which
 * runs the shared vehicle simulation. Seated, cuffed or riding along, the
 * input is acknowledged (its sequence number advances, so the client's
 * prediction stays in step) and otherwise ignored.
 */
export class MovementService {
  private readonly sims = new Map<string, Sim>();
  readonly collision = new WorldCollision();

  initialise(player: PlayerState, x: number, y: number, z: number, yaw: number): void {
    const sim: Sim = {
      motion: createMotion(x, y, z, yaw),
      events: createSimEvents(),
      params: createSimParams(),
      lastSeq: 0,
      budget: INITIAL_BUDGET,
      lastRefill: Date.now(),
    };
    this.sims.set(player.sessionId, sim);
    this.publish(player, sim);
  }

  forget(sessionId: string): void {
    this.sims.delete(sessionId);
  }

  motionOf(sessionId: string): PlayerMotion | undefined {
    return this.sims.get(sessionId)?.motion;
  }

  /** Teleport authoritatively. Only the server calls this. */
  teleport(sessionId: string, player: PlayerState, x: number, y: number, z: number, yaw: number): void {
    const sim = this.sims.get(sessionId);
    if (!sim) return;
    resetMotion(sim.motion, x, y, z, yaw);
    this.publish(player, sim);
  }

  /** Move the player's body without touching their prediction (riding, sitting). */
  hold(sessionId: string, player: PlayerState, x: number, y: number, z: number, yaw: number): void {
    const sim = this.sims.get(sessionId);
    if (!sim) return;
    const m = sim.motion;
    m.x = x;
    m.y = y;
    m.z = z;
    m.yaw = yaw;
    m.vx = 0;
    m.vy = 0;
    m.vz = 0;
    m.grounded = true;
    m.swimming = false;
    this.publish(player, sim);
  }

  /** Consume one input and advance the authoritative simulation. */
  applyInput(sessionId: string, player: PlayerState, message: MoveMessage, router: InputRouter): boolean {
    const sim = this.sims.get(sessionId);
    if (!sim) return false;

    const seq = message?.seq;
    const dt = message?.dt;
    if (typeof seq !== 'number' || !Number.isFinite(seq) || typeof dt !== 'number' || !Number.isFinite(dt) || dt < 0) return false;
    if (seq <= sim.lastSeq || seq > sim.lastSeq + MAX_SEQ_JUMP) return false;

    const step = Math.min(dt, MAX_SIM_DELTA);
    this.refill(sim);
    if (step > sim.budget) return false;
    sim.budget -= step;
    sim.lastSeq = seq;
    player.lastInputSeq = seq;
    const input = sanitiseInput(message);

    // Driving: the vehicle takes the input.
    if (player.vehicle !== 0) {
      if (player.seat === 0) router.drive(sessionId, input, step);
      return true;
    }
    // Sitting, lying, cuffed: no walking. A jump stands you up.
    if (player.pose !== POSE.stand || (player.status & STATUS.cuffed) !== 0) {
      if (input.jump && player.pose !== POSE.stand && (player.status & STATUS.cuffed) === 0) router.standUp(sessionId);
      sim.motion.jumpLatched = input.jump;
      player.jumpLatched = input.jump;
      return true;
    }

    this.collision.mover = sessionId;
    stepPlayer(sim.motion, input, sim.params, step, this.collision, sim.events, router.obstacles());
    this.collision.mover = '';
    this.publish(player, sim);
    if (player.emote !== 0 && horizontalSpeed(sim.motion) > 2) player.emote = 0;
    return true;
  }

  private publish(player: PlayerState, sim: Sim): void {
    const m = sim.motion;
    player.x = m.x;
    player.y = m.y;
    player.z = m.z;
    player.rotationY = m.yaw;
    player.velocityX = m.vx;
    player.velocityY = m.vy;
    player.velocityZ = m.vz;
    player.verticalVelocity = m.vy;
    player.speed = horizontalSpeed(m);
    player.grounded = m.grounded;
    player.swimming = m.swimming;
    player.jumpLatched = m.jumpLatched;
    player.jumpCount = m.jumpCount;
    player.lastInputSeq = sim.lastSeq;
    player.ready = true;
  }

  private refill(sim: Sim): void {
    const now = Date.now();
    const elapsed = Math.max(0, (now - sim.lastRefill) / 1000);
    sim.lastRefill = now;
    sim.budget = Math.min(sim.budget + elapsed * MAX_TIME_BUDGET_RATIO, MAX_SIM_DELTA * 20);
  }
}
