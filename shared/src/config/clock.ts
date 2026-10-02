/**
 * TIME IN PALMHAVEN, as pure functions of the server's clock, so every
 * client agrees on the hour and on every traffic light without being told.
 */

/** One full day, in real seconds. */
export const DAY_SECONDS = 24 * 60;
/** Where in the day the server's epoch starts (so a fresh server is morning-ish). */
const DAY_OFFSET = 0.33;

/** 0..1 through the day: 0 midnight, 0.25 dawn, 0.5 noon, 0.8 dusk. */
export const timeOfDay = (nowMs: number): number => {
  const t = (nowMs / 1000 / DAY_SECONDS + DAY_OFFSET) % 1;
  return t < 0 ? t + 1 : t;
};

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 0 at night, 1 in full day. Long days, short nights. */
export const daylight = (t: number): number => smooth(0.17, 0.24, t) * (1 - smooth(0.82, 0.89, t));

/** "7:42 PM". */
export const clockText = (t: number): string => {
  const minutes = Math.floor(t * 24 * 60);
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
};

export type Light = 'green' | 'yellow' | 'red';

/** One signal cycle, seconds. */
export const SIGNAL_CYCLE = 26;

/** What each direction shows at an intersection right now. */
export const signalPhase = (intersection: number, nowMs: number): { ns: Light; ew: Light } => {
  const t = ((nowMs / 1000 + intersection * 2.3) % SIGNAL_CYCLE + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  if (t < 11) return { ns: 'green', ew: 'red' };
  if (t < 13) return { ns: 'yellow', ew: 'red' };
  if (t < 24) return { ns: 'red', ew: 'green' };
  return { ns: 'red', ew: 'yellow' };
};
