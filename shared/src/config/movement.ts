/**
 * Movement tuning for people on foot: walk, run, jump and swim.
 *
 * The client predicts with these numbers and the server simulates with them,
 * so there is exactly one copy.
 */
export interface MovementConfig {
  readonly acceleration: number;
  readonly deceleration: number;
  /** Fraction of ground acceleration retained in the air. */
  readonly airControl: number;
  /** Downward acceleration, world units per second squared. */
  readonly gravity: number;
  /** Turn rate toward the movement direction, radians per second. */
  readonly turnSpeed: number;
  /** Largest distance one substep may integrate. */
  readonly maxSubstepDistance: number;
  readonly maxSubsteps: number;
  /** Height the character steps up without jumping: curbs, stair treads. */
  readonly stepHeight: number;
  /** Climbing out of the sea onto a dock or the shore. */
  readonly swimStep: number;
  /** Fastest fall, so a long drop cannot tunnel a floor. */
  readonly terminalVelocity: number;
}

export const MOVEMENT: MovementConfig = {
  acceleration: 110,
  deceleration: 100,
  airControl: 0.55,
  gravity: 72,
  turnSpeed: 12,
  maxSubstepDistance: 0.5,
  maxSubsteps: 40,
  stepHeight: 1.1,
  swimStep: 3.2,
  terminalVelocity: 90,
};

/** Strolling pace, world units per second. */
export const WALK_SPEED = 13;
/** Holding SHIFT. */
export const RUN_SPEED = 21;
/** In the sea. */
export const SWIM_SPEED = 8;

/** Jump take-off velocity: over a curb, onto a bench. */
export const JUMP_VELOCITY = 24;
