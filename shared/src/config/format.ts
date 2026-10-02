/**
 * Number formatting shared by the HUD, the world signs and the boards, so a
 * figure reads the same everywhere it appears.
 */

/** Compact display: 940, 1.4K, 13.2K, 453K, 3.1M, 2.5B, 4T. */
export const formatAmount = (value: number): string => {
  const amount = Number.isFinite(value) ? Math.max(0, value) : 0;
  const compact = (divisor: number, suffix: string): string => {
    const scaled = amount / divisor;
    // Truncated, never rounded up: 1,999 is "1.9K", not a "2K" the player does not have.
    const text = scaled >= 100 ? Math.floor(scaled).toString() : (Math.floor(scaled * 10) / 10).toString();
    return `${text}${suffix}`;
  };
  if (amount >= 1e15) return compact(1e15, 'Qa');
  if (amount >= 1e12) return compact(1e12, 'T');
  if (amount >= 1e9) return compact(1e9, 'B');
  if (amount >= 1e6) return compact(1e6, 'M');
  if (amount >= 1_000) return compact(1_000, 'K');
  return Math.floor(amount).toString();
};

/** Wins as the HUD prints them: exact under ten thousand, compact past it. */
export const formatWins = (value: number): string => {
  const amount = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return amount < 10_000 ? amount.toLocaleString('en-US') : formatAmount(amount);
};

/** A multiplier as the menus print it: x1, x2, x2.5. */
export const formatMultiplier = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  return `x${Number.isInteger(rounded) ? rounded.toString() : rounded.toString()}`;
};

/** A percentage bonus: +7%, +22.4%. */
export const formatPercent = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return `+${rounded}%`;
};

/** mm:ss for a countdown. */
export const formatClock = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m.toString().padStart(2, '0')}m ${(s % 60).toString().padStart(2, '0')}s`;
};

/** A shop price as the reference prints it: "1500", "5000", then "15K", "250K", "1M". */
export const formatPrice = (value: number): string => {
  const amount = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return amount < 10_000 ? amount.toString() : formatAmount(amount);
};

/** Every digit, with commas: the leaderboard's "$8,617,199,212,701". */
export const formatFull = (value: number): string => {
  const amount = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return amount.toLocaleString('en-US');
};

/** A countdown as the shops print it: "3:01", "19:33:35". */
export const formatTimer = (seconds: number): string => {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`;
  return `${m}:${r.toString().padStart(2, '0')}`;
};

/** A weight as the backpack prints it: "0.05 KG". */
export const formatWeight = (kg: number): string => `${(Math.round(kg * 100) / 100).toFixed(2)} KG`;
