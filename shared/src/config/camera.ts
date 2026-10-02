/**
 * Third-person chase camera tuning.
 *
 * Lives in shared config so gameplay can reason about framing without
 * importing the renderer.
 */
export interface CameraConfig {
  /** Distance behind the character at rest, in world units. */
  readonly distance: number;
  /** Height above the feet that the camera sits at. */
  readonly height: number;
  /** Height above the feet that the camera looks at - the chest. */
  readonly lookAtHeight: number;
  /** Positional smoothing factor per second (higher = snappier). */
  readonly followLerp: number;
  /** Vertical field of view in degrees at rest. */
  readonly fov: number;
  /**
   * Near clip plane. Depth precision falls off with the square of distance over
   * this, so it is kept as far out as the camera allows: 0.3 keeps two surfaces
   * a twentieth of a unit apart distinct past 400 units, where 0.1 let them fight.
   */
  readonly near: number;
  readonly far: number;
  /** Extra distance at full speed. */
  readonly speedDistance: number;
  /** Extra vertical FOV in degrees at full speed, for the sense of rush. */
  readonly speedFov: number;
  /** Speed at which the two allowances above are fully applied. */
  readonly speedReference: number;
  /** How fast the dynamic distance and FOV ease, per second. */
  readonly speedEase: number;
  /** Closest the player may pull the camera, as an OFFSET on `distance`. */
  readonly zoomMin: number;
  /** Furthest the player may push the camera, as an offset on `distance`. */
  readonly zoomMax: number;
  /** World units of zoom per wheel notch. */
  readonly zoomStep: number;
  /** How fast the zoom eases toward what the wheel asked for, per second. */
  readonly zoomEase: number;
}

/**
 * FRAMED LIKE A ROBLOX CITY RP: back and above the citizen, far enough to
 * see the street round them, tilted gently down. The wheel zooms from over
 * the shoulder to a bird's-eye view; vehicles widen the frame to their size.
 */
export const CAMERA: CameraConfig = {
  distance: 16,
  height: 4,
  lookAtHeight: 2.7,
  followLerp: 14,
  fov: 70,
  near: 0.5,
  far: 2000,
  speedDistance: 2,
  speedFov: 6,
  speedReference: 90,
  speedEase: 3,
  zoomMin: -9,
  zoomMax: 34,
  zoomStep: 1.4,
  zoomEase: 12,
};
