/**
 * WHAT A CHARACTER IS DOING this frame. Written by its owner (the local
 * player's prediction, or a remote's replicated state) and only ever read by
 * its animator.
 */
export interface Motion {
  /** Horizontal speed, world units per second. */
  speed: number;
  grounded: boolean;
  swimming: boolean;
  verticalVelocity: number;
  /** Signed yaw rate, radians per second, for the body's lean into a turn. */
  turnRate: number;
  /** Something in the right hand: the arm is held out, Roblox-style. */
  holding: boolean;
  /** What is held (item key), for item-specific holds. */
  heldKey: string;
  /** Seconds since the current item use began, or -1, and what kind it is. */
  actionTime: number;
  actionKind: ActionKind;
  /** Seconds since a cheer began, or -1. */
  cheerTime: number;
  /** True on the frame it touched down. */
  landed: boolean;
  /** POSE: 0 stand, 1 sit, 2 lie, 3 swing, 4 ride, 5 drive, 6 board. */
  pose: number;
  /** Emote id (0 none) and seconds since it started. */
  emote: number;
  emoteTime: number;
  cuffed: boolean;
  /** Steering input -1..1 while driving (hands turn the wheel). */
  steer: number;
  /** A Bloxity catalogue emote ('' none) and when it began (room clock, ms). */
  bxId: string;
  bxStart: number;
}

export type ActionKind = 'eat' | 'drink' | 'strum' | 'photo' | 'wave' | 'fish' | 'party' | 'use';

export const createMotion = (): Motion => ({
  speed: 0,
  grounded: true,
  swimming: false,
  verticalVelocity: 0,
  turnRate: 0,
  holding: false,
  heldKey: '',
  actionTime: -1,
  actionKind: 'use',
  cheerTime: -1,
  landed: false,
  pose: 0,
  emote: 0,
  emoteTime: 0,
  cuffed: false,
  steer: 0,
  bxId: '',
  bxStart: 0,
});

/** How long one item use plays. */
export const ACTION_SECONDS = 1.1;
/** A cheer (a purchase, a job done). */
export const CHEER_SECONDS = 1.4;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const smooth = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export const damp = (current: number, target: number, rate: number, dt: number): number => current + (target - current) * (1 - Math.exp(-rate * dt));
/** 0 -> 1 -> 0 over [a, b]. */
export const bump = (t: number, a: number, b: number): number => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));
/** 0 -> 1 over [a, b], held at 1. */
export const ramp = (t: number, a: number, b: number): number => smooth((t - a) / Math.max(1e-6, b - a));
