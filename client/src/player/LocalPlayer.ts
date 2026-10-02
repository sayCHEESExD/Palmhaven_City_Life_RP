import {
  POSE,
  STATUS,
  copyMotion,
  copyVehicleMotion,
  createMotion,
  createSimEvents,
  createSimParams,
  createVehicleEvents,
  createVehicleMotion,
  horizontalSpeed,
  resetMotion,
  stepPlayer,
  stepVehicle,
  vehicleById,
  type MoveMessage,
  type MovementInput,
  type Obstacle,
  type PlayerMotion,
  type SimParams,
  type VehicleDef,
  type VehicleEvents,
  type VehicleMotion,
  type WorldCollision,
} from '@palmhaven/shared';
import { Vector3 } from 'three';
import type { InputState } from '../input/InputState.js';
import type { NetPlayerState, NetVehicleState } from '../net/netTypes.js';
import { PlayerCharacter } from './PlayerCharacter.js';

const MAX_PENDING_INPUTS = 240;
const FIXED_DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;
const SNAP_DISTANCE = 6;
const CORRECTION_RATE = 12;

const lerp = (from: number, to: number, alpha: number): number => from + (to - from) * alpha;
const shortest = (from: number, to: number): number => {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const EMPTY_INPUTS: MoveMessage[] = [];

export type PlacementKind = 'none' | 'respawn' | 'correction';
/** What the local body is doing: walking (predicted), driving (vehicle predicted), or carried (server placed). */
export type LocalMode = 'walk' | 'drive' | 'carried';

interface PendingInput {
  seq: number;
  dt: number;
  input: MovementInput;
}

/**
 * THE LOCALLY CONTROLLED RESIDENT: a PREDICTION of a server-owned simulation.
 *
 * On foot it runs the shared `stepPlayer`; in the driver's seat it runs the
 * shared `stepVehicle` on the vehicle itself. Either way it keeps every input
 * the server has not acknowledged and, on each server update, snaps to the
 * authoritative state and replays them, so the controls answer instantly and
 * the result agrees with everybody else's screen.
 *
 * Riding along, sitting or in cuffs, the body is placed by the server and
 * inputs are still sent (so the sequence stays in step) but not simulated.
 */
export class LocalPlayer {
  readonly character: PlayerCharacter;
  /** Where to draw the player (and aim the camera). */
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  mode: LocalMode = 'walk';

  private readonly previous = { x: 0, y: 0, z: 0 };
  private readonly motion: PlayerMotion = createMotion();
  private readonly events = createSimEvents();
  private readonly replayEvents = createSimEvents();
  private readonly params: SimParams = createSimParams();

  /** The predicted vehicle while driving. */
  readonly vehicle: VehicleMotion = createVehicleMotion();
  private readonly vehiclePrevious = createVehicleMotion();
  private readonly vehicleEvents: VehicleEvents = createVehicleEvents();
  private readonly vehicleReplay: VehicleEvents = createVehicleEvents();
  vehicleId = 0;
  vehicleDef: VehicleDef | null = null;
  private fuel = 100;
  /** Visual-only smoothing of a corrected vehicle. */
  private readonly vehicleCorrection = new Vector3();
  private vehicleYawCorrection = 0;
  /** The interpolated, corrected vehicle transform for drawing. */
  readonly vehicleView = { x: 0, y: 0, z: 0, yaw: 0, speed: 0 };

  private readonly pending: PendingInput[] = [];
  private nextSeq = 1;
  private readonly outgoing: MoveMessage[] = [];
  private accumulator = 0;
  private readonly correction = new Vector3();
  private placement: PlacementKind = 'none';
  private lastYaw = 0;
  private turnRate = 0;
  private jumpPending = false;
  private wasJumpHeld = false;
  jumpedEdge = false;
  landedEdge = false;
  splashedEdge = false;
  /** Hardest bump this frame while driving (for sound and shake). */
  crash = 0;

  constructor(private readonly collision: WorldCollision) {
    this.character = new PlayerCharacter();
    this.syncFromMotion();
  }

  get horizontalSpeed(): number {
    if (this.mode === 'drive') return Math.hypot(this.vehicle.vx, this.vehicle.vz);
    return horizontalSpeed(this.motion);
  }

  get isGrounded(): boolean {
    return this.motion.grounded;
  }

  get swimming(): boolean {
    return this.motion.swimming;
  }

  get yaw(): number {
    return this.mode === 'drive' ? this.vehicle.yaw : this.motion.yaw;
  }

  drainOutgoing(): MoveMessage[] {
    if (this.outgoing.length === 0) return EMPTY_INPUTS;
    const batch = this.outgoing.slice();
    this.outgoing.length = 0;
    return batch;
  }

  /** Server placed us (spawn, teleport, out of a vehicle). */
  teleport(x: number, y: number, z: number, rotationY: number): void {
    resetMotion(this.motion, x, y, z, rotationY);
    this.previous.x = x;
    this.previous.y = y;
    this.previous.z = z;
    this.pending.length = 0;
    this.accumulator = 0;
    this.correction.set(0, 0, 0);
    this.placement = 'respawn';
    this.jumpPending = false;
    this.character.resetAnimation();
    this.syncFromMotion();
  }

  /** The authoritative state arrived: pick the mode, snap, replay. */
  reconcile(state: NetPlayerState, vehicle: NetVehicleState | null): void {
    const driving = state.vehicle !== 0 && state.seat === 0 && vehicle !== null;
    const carried = !driving && (state.vehicle !== 0 || state.pose !== POSE.stand || (state.status & STATUS.cuffed) !== 0);
    const next: LocalMode = driving ? 'drive' : carried ? 'carried' : 'walk';
    if (next !== this.mode) {
      this.mode = next;
      this.correction.set(0, 0, 0);
      this.vehicleCorrection.set(0, 0, 0);
      this.vehicleYawCorrection = 0;
      if (next === 'drive' && vehicle) {
        this.vehicleId = vehicle.id;
        this.vehicleDef = vehicleById(vehicle.kind) ?? null;
        this.seedVehicle(vehicle);
        copyVehicleMotion(this.vehicle, this.vehiclePrevious);
      }
    }
    const acked = state.lastInputSeq;
    let kept = 0;
    for (const entry of this.pending) {
      if (entry.seq <= acked) continue;
      this.pending[kept] = entry;
      kept += 1;
    }
    this.pending.length = kept;

    if (this.mode === 'drive' && vehicle && this.vehicleDef) {
      const before = { x: this.vehicle.x, y: this.vehicle.y, z: this.vehicle.z, yaw: this.vehicle.yaw };
      this.seedVehicle(vehicle);
      this.fuel = vehicle.fuel;
      for (const entry of this.pending) {
        stepVehicle(this.vehicle, entry.input, this.vehicleDef, { fuel: this.fuel, self: this.vehicleId }, entry.dt, this.collision, this.obstacles, this.vehicleReplay);
      }
      const dx = before.x - this.vehicle.x;
      const dy = before.y - this.vehicle.y;
      const dz = before.z - this.vehicle.z;
      if (Math.hypot(dx, dy, dz) > SNAP_DISTANCE * 2) {
        this.vehicleCorrection.set(0, 0, 0);
        this.vehicleYawCorrection = 0;
        copyVehicleMotion(this.vehicle, this.vehiclePrevious);
      } else {
        this.vehicleCorrection.x += dx;
        this.vehicleCorrection.y += dy;
        this.vehicleCorrection.z += dz;
        this.vehicleYawCorrection += shortest(this.vehicle.yaw, before.yaw);
      }
      return;
    }

    if (this.mode === 'carried') {
      // The server places the body; follow it closely.
      this.motion.x = state.x;
      this.motion.y = state.y;
      this.motion.z = state.z;
      this.motion.yaw = state.rotationY;
      this.motion.vx = 0;
      this.motion.vz = 0;
      this.motion.vy = 0;
      this.motion.grounded = true;
      this.motion.swimming = false;
      // No prediction runs while carried, so there is nothing to interpolate
      // from: a stale "previous" (where they stood before sitting) would drag
      // the body - and the camera - back and forth every frame.
      this.previous.x = state.x;
      this.previous.y = state.y;
      this.previous.z = state.z;
      this.correction.set(0, 0, 0);
      return;
    }

    // On foot.
    const predictedX = this.motion.x;
    const predictedY = this.motion.y;
    const predictedZ = this.motion.z;
    const m = this.motion;
    m.x = state.x;
    m.y = state.y;
    m.z = state.z;
    m.vx = state.velocityX;
    m.vy = state.velocityY;
    m.vz = state.velocityZ;
    m.yaw = state.rotationY;
    m.grounded = state.grounded;
    m.swimming = state.swimming;
    m.jumpLatched = state.jumpLatched;
    m.jumpCount = state.jumpCount;
    for (const entry of this.pending) stepPlayer(m, entry.input, this.params, entry.dt, this.collision, this.replayEvents, this.obstacles);
    const dx = predictedX - m.x;
    const dy = predictedY - m.y;
    const dz = predictedZ - m.z;
    const snapped = Math.hypot(dx, dy, dz) > SNAP_DISTANCE;
    if (snapped) {
      this.correction.set(0, 0, 0);
      this.previous.x = m.x;
      this.previous.y = m.y;
      this.previous.z = m.z;
      if (this.placement === 'none') this.placement = 'correction';
    } else {
      this.correction.x += dx;
      this.correction.y += dy;
      this.correction.z += dz;
    }
  }

  private seedVehicle(v: NetVehicleState): void {
    const m = this.vehicle;
    m.x = v.x;
    m.y = v.y;
    m.z = v.z;
    m.yaw = v.yaw;
    m.vx = v.vx;
    m.vz = v.vz;
    m.vy = v.vy;
    m.grounded = v.grounded;
    m.nitro = v.nitro;
    m.throttle = v.throttle;
    m.steer = v.steer ?? 0;
  }

  /** Other vehicles' bodies, refreshed by the game every frame. */
  obstacles: readonly Obstacle[] = [];

  update(delta: number, input: Readonly<InputState>, cameraYaw: number): void {
    this.jumpedEdge = false;
    this.landedEdge = false;
    this.splashedEdge = false;
    this.crash = 0;
    if (input.jump && !this.wasJumpHeld) this.jumpPending = true;
    this.wasJumpHeld = input.jump;
    this.accumulator += Math.max(0, delta);
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.accumulator -= FIXED_DT;
      steps += 1;
      const movement: MovementInput = {
        moveX: input.moveX,
        moveZ: input.moveZ,
        jump: this.jumpPending || input.jump,
        sprint: input.sprint,
        down: input.down,
        cameraYaw,
      };
      this.jumpPending = false;
      const seq = this.nextSeq;
      this.nextSeq += 1;
      if (this.mode === 'walk') {
        this.previous.x = this.motion.x;
        this.previous.y = this.motion.y;
        this.previous.z = this.motion.z;
        stepPlayer(this.motion, movement, this.params, FIXED_DT, this.collision, this.events, this.obstacles);
        this.jumpedEdge = this.jumpedEdge || this.events.jumped;
        this.landedEdge = this.landedEdge || this.events.landed;
        this.splashedEdge = this.splashedEdge || this.events.splashed;
      } else if (this.mode === 'drive' && this.vehicleDef) {
        copyVehicleMotion(this.vehicle, this.vehiclePrevious);
        stepVehicle(this.vehicle, movement, this.vehicleDef, { fuel: this.fuel, self: this.vehicleId }, FIXED_DT, this.collision, this.obstacles, this.vehicleEvents);
        this.crash = Math.max(this.crash, this.vehicleEvents.crash);
      }
      this.pending.push({ seq, dt: FIXED_DT, input: movement });
      if (this.pending.length > MAX_PENDING_INPUTS) this.pending.shift();
      this.outgoing.push({ seq, dt: FIXED_DT, moveX: movement.moveX, moveZ: movement.moveZ, jump: movement.jump, sprint: movement.sprint, down: movement.down, cameraYaw });
    }
    if (this.accumulator > FIXED_DT * MAX_STEPS_PER_FRAME) this.accumulator = 0;

    const decay = Math.exp(-CORRECTION_RATE * delta);
    this.correction.multiplyScalar(decay);
    if (this.correction.lengthSq() < 1e-8) this.correction.set(0, 0, 0);
    this.vehicleCorrection.multiplyScalar(decay);
    this.vehicleYawCorrection *= decay;

    this.syncFromMotion();
    this.updateAnimation(delta);
  }

  consumePlacement(): PlacementKind {
    const kind = this.placement;
    this.placement = 'none';
    return kind;
  }

  readMotion(into: PlayerMotion): void {
    copyMotion(this.motion, into);
  }

  private syncFromMotion(): void {
    const alpha = Math.min(Math.max(this.accumulator / FIXED_DT, 0), 1);
    if (this.mode === 'drive') {
      const a = this.vehiclePrevious;
      const b = this.vehicle;
      const v = this.vehicleView;
      v.x = lerp(a.x, b.x, alpha) + this.vehicleCorrection.x;
      v.y = lerp(a.y, b.y, alpha) + this.vehicleCorrection.y;
      v.z = lerp(a.z, b.z, alpha) + this.vehicleCorrection.z;
      v.yaw = a.yaw + shortest(a.yaw, b.yaw) * alpha + this.vehicleYawCorrection;
      v.speed = Math.hypot(b.vx, b.vz);
      this.position.set(v.x, v.y, v.z);
      this.velocity.set(b.vx, b.vy, b.vz);
      return;
    }
    if (this.mode === 'carried') {
      // Server-placed (a seat, a bed, a passenger seat, cuffs): exactly where it says.
      this.position.set(this.motion.x, this.motion.y, this.motion.z);
      this.velocity.set(0, 0, 0);
      return;
    }
    this.position.set(
      lerp(this.previous.x, this.motion.x, alpha) + this.correction.x,
      lerp(this.previous.y, this.motion.y, alpha) + this.correction.y,
      lerp(this.previous.z, this.motion.z, alpha) + this.correction.z,
    );
    this.velocity.set(this.motion.vx, this.motion.vy, this.motion.vz);
    if (this.mode === 'walk') {
      this.character.setPosition(this.position.x, this.position.y, this.position.z);
      this.character.root.rotation.y = this.motion.yaw;
    }
  }

  private updateAnimation(delta: number): void {
    const m = this.character.motion;
    let turn = this.motion.yaw - this.lastYaw;
    turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
    this.lastYaw = this.motion.yaw;
    this.turnRate += ((delta > 0 ? turn / delta : 0) - this.turnRate) * Math.min(1, delta * 10);
    m.grounded = this.motion.grounded;
    m.swimming = this.motion.swimming && this.mode === 'walk';
    m.speed = this.mode === 'walk' ? horizontalSpeed(this.motion) : 0;
    m.verticalVelocity = this.motion.vy;
    m.turnRate = this.turnRate;
    m.landed = this.landedEdge;
    this.character.update(delta);
  }
}
