/**
 * MONEY IN PALMHAVEN. Generous on purpose: this is a roleplay sandbox, so a
 * player can afford a car and some furniture in their first session, and
 * the expensive things (yacht, mansion, crown) are goals, not walls.
 */

export const STARTING_MONEY = 3000;

/** Claimed once a day at any ATM. */
export const DAILY_BONUS = 500;

/** Most a player may hand another in one go, and how often. */
export const GIFT_MAX = 1000;
export const GIFT_COOLDOWN_SECONDS = 20;

/** Money is a whole number of dollars and never goes negative. */
export const MAX_MONEY = 1e10;

export const formatMoney = (value: number): string => {
  const amount = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `$${amount.toLocaleString('en-US')}`;
};

/** Compact money for tight spaces: $950, $12.4K, $1.2M. */
export const formatMoneyShort = (value: number): string => {
  const amount = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  if (amount >= 1e6) return `$${(Math.floor(amount / 1e5) / 10).toString()}M`;
  if (amount >= 1e4) return `$${(Math.floor(amount / 100) / 10).toString()}K`;
  return `$${amount.toLocaleString('en-US')}`;
};
