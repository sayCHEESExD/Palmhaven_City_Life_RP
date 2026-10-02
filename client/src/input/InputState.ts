/** Normalised, device-agnostic input snapshot consumed by the player controller. */
export interface InputState {
  /** -1 (left) .. 1 (right): strafe on foot, steer in a vehicle. */
  moveX: number;
  /** -1 (back) .. 1 (forward): walk on foot, throttle in a vehicle. */
  moveZ: number;
  /** Space / JUMP: jump, handbrake, climb. Held. */
  jump: boolean;
  /** Shift / RUN: run on foot, nitro in a vehicle. Held. */
  sprint: boolean;
  /** C / Ctrl / DOWN: descend in an aircraft. Held. */
  down: boolean;
}

export const createInputState = (): InputState => ({ moveX: 0, moveZ: 0, jump: false, sprint: false, down: false });
