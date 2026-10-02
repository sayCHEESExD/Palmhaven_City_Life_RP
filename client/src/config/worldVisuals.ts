/**
 * The few colours and distances the renderer needs before the weather takes
 * over. Every coordinate lives in `@palmhaven/shared`'s map config.
 */
export const PALETTE = {
  /** The haze on the horizon on a clear day. */
  fog: 0xd8ecfa,
} as const;

/** Fog band: far enough to see across the whole island. */
export const WORLD_FOG = {
  near: 240,
  far: 950,
} as const;

/** Yaw correction for the supplied player FBX. It already faces +Z. */
export const PLAYER_MODEL_YAW_OFFSET = 0;
