import { POSE, isBoat, vehicleById, type VehicleDef } from '@palmhaven/shared';
import { Group, Vector3 } from 'three';
import { buildVehicleModel, type VehicleModel } from '../models/vehicles.js';
import { NpcCharacter } from '../player/NpcCharacter.js';
import { NPC_LOOK_LIST } from '../player/npcLooks.js';

const FLAG_LIGHTS = 1;
const FLAG_SIREN = 2;

const shortest = (from: number, to: number): number => {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** The drawn transform of a vehicle this frame. */
export interface VehiclePose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/**
 * ONE VEHICLE ON SCREEN: its model, placed from replicated state (or from
 * the local driver's prediction), wheels rolling and steering, a bike leaning
 * into its turns, a boat bobbing and pitching on the swell, a helicopter
 * tilting into its flight, a plane banking; lights, brake lights, a flashing
 * light bar, the taxi's FARE sign and the fare sitting in the back.
 */
export class VehicleView {
  readonly root = new Group();
  readonly def: VehicleDef;
  readonly pose: VehiclePose = { x: 0, y: 0, z: 0, yaw: 0 };
  private readonly model: VehicleModel;
  private target = { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, vy: 0 };
  private placed = false;
  private wheelSpin = 0;
  private steer = 0;
  private lean = 0;
  private pitch = 0;
  private lastYaw = 0;
  private yawRate = 0;
  private speed = 0;
  private lastSpeed = 0;
  private braking = 0;
  private time = Math.random() * 10;
  private fare: NpcCharacter | null = null;
  private fareLook = 0;
  sinceUpdate = 0;
  flags = 0;
  horn = -1;

  constructor(readonly id: number, kind: number, paint: number) {
    this.def = vehicleById(kind)!;
    this.model = buildVehicleModel(this.def.key, paint);
    this.root.add(this.model.root);
  }

  /** A replicated update for a vehicle somebody else drives (or nobody). */
  setTarget(x: number, y: number, z: number, yaw: number, vx: number, vz: number, vy: number): void {
    this.target = { x, y, z, yaw, vx, vz, vy };
    this.sinceUpdate = 0;
    if (!this.placed) {
      this.pose.x = x;
      this.pose.y = y;
      this.pose.z = z;
      this.pose.yaw = yaw;
      this.lastYaw = yaw;
      this.placed = true;
    }
  }

  /** The local driver's predicted transform, used as-is. */
  setExact(x: number, y: number, z: number, yaw: number): void {
    this.pose.x = x;
    this.pose.y = y;
    this.pose.z = z;
    this.pose.yaw = yaw;
    this.placed = true;
  }

  setFare(fare: number): void {
    if (fare === this.fareLook) return;
    this.fareLook = fare;
    this.fare?.dispose();
    this.fare = null;
    if (fare > 0) {
      const look = NPC_LOOK_LIST[(fare - 1) % NPC_LOOK_LIST.length];
      if (look) {
        this.fare = new NpcCharacter(look);
        this.fare.character.motion.pose = POSE.sit;
        const seat = this.def.seats[2] ?? this.def.seats[1] ?? this.def.seats[0]!;
        this.fare.root.position.set(seat.x, seat.y, seat.z);
        this.model.body.add(this.fare.root);
      }
    }
  }

  /**
   * Advance the drawing. `exact` = the transform was set by prediction this
   * frame; otherwise glide toward the replicated one, extrapolating by its
   * velocity for the moments between patches.
   */
  update(delta: number, exact: boolean, steerInput: number, night: number): void {
    const dt = Math.max(0, delta);
    this.time += dt;
    this.sinceUpdate += dt;
    const p = this.pose;
    if (!exact) {
      const ahead = Math.min(this.sinceUpdate, 0.25);
      const tx = this.target.x + this.target.vx * ahead;
      const ty = this.target.y + this.target.vy * Math.min(ahead, 0.1);
      const tz = this.target.z + this.target.vz * ahead;
      const gap = Math.hypot(tx - p.x, tz - p.z);
      if (gap > 30) {
        p.x = tx;
        p.y = ty;
        p.z = tz;
        p.yaw = this.target.yaw;
      } else {
        const k = 1 - Math.exp(-12 * dt);
        p.x += (tx - p.x) * k;
        p.y += (ty - p.y) * k;
        p.z += (tz - p.z) * k;
        p.yaw += shortest(p.yaw, this.target.yaw) * k;
      }
    }
    // Rates for the animation.
    const yawDelta = shortest(this.lastYaw, p.yaw);
    this.lastYaw = p.yaw;
    this.yawRate += ((dt > 0 ? yawDelta / dt : 0) - this.yawRate) * Math.min(1, dt * 8);
    const speedNow = exact ? this.speed : Math.hypot(this.target.vx, this.target.vz);
    const forward = Math.sin(p.yaw) * this.target.vx + Math.cos(p.yaw) * this.target.vz;
    const signed = exact ? this.speed : forward;
    this.braking += ((this.lastSpeed - Math.abs(signed) > 18 * dt ? 1 : 0) - this.braking) * Math.min(1, dt * 10);
    this.lastSpeed = Math.abs(signed);
    void speedNow;

    this.root.position.set(p.x, p.y, p.z);
    this.root.rotation.set(0, p.yaw, 0);

    // Wheels roll; front wheels steer toward the turn.
    const wheelRadius = this.def.class === 'bike' ? 0.85 : this.def.class === 'board' ? 0.2 : 0.75;
    this.wheelSpin += (signed / wheelRadius) * dt;
    for (const wheel of this.model.wheels) wheel.rotation.x = this.wheelSpin;
    const wantSteer = exact ? -steerInput * 0.5 : Math.max(-0.5, Math.min(0.5, this.yawRate * 0.25 * Math.sign(signed || 1)));
    this.steer += (wantSteer - this.steer) * Math.min(1, dt * 10);
    for (const s of this.model.steering) s.rotation.y = this.steer;

    // Body attitude per class.
    const body = this.model.body;
    const cls = this.def.class;
    if (cls === 'bike' || cls === 'board') {
      const want = Math.max(-0.5, Math.min(0.5, -this.yawRate * Math.abs(signed) * 0.012));
      this.lean += (want - this.lean) * Math.min(1, dt * 6);
      body.rotation.set(0, 0, this.lean);
    } else if (isBoat(this.def)) {
      const fast = Math.min(1, Math.abs(signed) / this.def.handling.maxSpeed);
      this.pitch += (-fast * 0.12 - this.pitch) * Math.min(1, dt * 3);
      const bob = Math.sin(this.time * 1.7) * 0.12 * (1 - fast * 0.6);
      body.position.y = bob + fast * 0.25;
      body.rotation.set(this.pitch + Math.sin(this.time * 1.3) * 0.02, 0, Math.sin(this.time * 1.1) * 0.03 - this.yawRate * fast * 0.15);
    } else if (cls === 'heli') {
      const air = p.y > 0.5 || !exact;
      const wantPitch = air ? Math.max(-0.25, Math.min(0.25, signed * 0.004)) : 0;
      this.pitch += (wantPitch - this.pitch) * Math.min(1, dt * 3);
      body.rotation.set(this.pitch, 0, -this.yawRate * 0.18);
    } else if (cls === 'plane') {
      const vy = this.target.vy;
      const wantPitch = Math.max(-0.4, Math.min(0.4, -Math.atan2(vy, Math.max(10, Math.abs(signed))) ));
      this.pitch += (wantPitch - this.pitch) * Math.min(1, dt * 3);
      body.rotation.set(this.pitch, 0, -this.yawRate * 0.5);
    } else {
      // Cars squat and roll a little.
      this.lean += (-this.yawRate * Math.abs(signed) * 0.0025 - this.lean) * Math.min(1, dt * 5);
      body.rotation.set(-this.braking * 0.025, 0, Math.max(-0.06, Math.min(0.06, this.lean)));
    }

    // Rotors and props.
    const powered = cls === 'heli' ? 1 : Math.min(1, Math.abs(signed) / 10 + 0.4);
    for (const r of this.model.rotors) {
      // A yacht's radar turns slowly whatever the boat is doing.
      const spin = isBoat(this.def) && r.axis === 'y' ? 1.6 * dt : (cls === 'heli' ? 26 : 30) * powered * dt;
      r.object.rotation[r.axis] += spin;
    }

    // Lights.
    const lights = (this.flags & FLAG_LIGHTS) !== 0 || night > 0.55;
    if (this.model.headlights) this.model.headlights.visible = lights;
    if (this.model.brakeLights) this.model.brakeLights.visible = this.braking > 0.2 || lights;
    if (this.model.sirens) {
      const on = (this.flags & FLAG_SIREN) !== 0;
      const phase = Math.floor(this.time * 6) % 2 === 0;
      this.model.sirens.red.visible = on ? phase : false;
      this.model.sirens.blue.visible = on ? !phase : false;
    }
    if (this.model.taxiSign) this.model.taxiSign.visible = this.fareLook === 0;
    this.fare?.update(dt);
  }

  /** Feed the speed of an exact (predicted) vehicle. */
  setSpeed(speed: number): void {
    this.speed = speed;
  }

  /** World transform of a seat (for placing riders). */
  seatWorld(seat: number, out: Vector3): { yaw: number } {
    const s = this.def.seats[seat] ?? this.def.seats[0]!;
    this.root.updateMatrixWorld(true);
    out.set(s.x, s.y, s.z);
    this.model.body.localToWorld(out);
    return { yaw: this.pose.yaw };
  }

  dispose(): void {
    this.fare?.dispose();
    this.model.dispose();
    this.root.removeFromParent();
  }
}

export const SEAT_POSE = (def: VehicleDef, seat: number): number => {
  const s = def.seats[seat];
  if (!s) return POSE.sit;
  if (s.kind === 'drive') return def.class === 'bike' || (def.class === 'boat' && def.key === 'jetski') ? POSE.ride : POSE.drive;
  if (s.kind === 'ride') return POSE.ride;
  if (s.kind === 'stand') return POSE.standOn;
  return POSE.sit;
};
