/**
 * Deterministic randomness, identical on the server and every client.
 *
 * The shops' restocks, the weather schedule and the daily quests are all
 * functions of the WALL CLOCK passed through these, so every room on every pod
 * agrees on them without talking to each other, and a client can show a
 * restock timer that is exactly right without being told.
 */

/** A stable 32-bit FNV-1a hash of a string. */
export const hashString = (value: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** Mix integers into one 32-bit seed. */
export const hashInts = (...values: number[]): number => {
  let h = 0x9e3779b9;
  for (const value of values) {
    h ^= Math.floor(value) + 0x7f4a7c15 + (h << 6) + (h >>> 2);
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
};

/** mulberry32: a small, fast, seeded generator in [0, 1). */
export const rng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** An integer in [min, max], inclusive. */
export const randInt = (random: () => number, min: number, max: number): number =>
  min + Math.floor(random() * (max - min + 1));

/** Pick by weight. */
export const weightedPick = <T>(random: () => number, entries: readonly (readonly [T, number])[]): T => {
  let total = 0;
  for (const [, weight] of entries) total += Math.max(0, weight);
  let roll = random() * total;
  for (const [value, weight] of entries) {
    roll -= Math.max(0, weight);
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1]![0];
};
