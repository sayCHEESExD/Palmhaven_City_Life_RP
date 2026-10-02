import type { ProgressFields } from '../persistence/StoredProfile.js';
import { logger } from '../util/logger.js';

const SCOPE = 'bloxity/stats';

/**
 * BLOXITY STAT REPORTING: what this game shows on each player's Bloxity
 * profile, under "Only in this game".
 *
 * THE ONE RULE: every value is read from state THIS SERVER owns - the live
 * profile the room's services write and the store persists, and the
 * account id Bloxity itself VERIFIED for the session - never a client
 * message. The reporting credential lives only on the pod, and these numbers
 * can complete missions that pay real currency.
 *
 * Bloxity already tracks playtime, sessions, streaks and a per-game level, so
 * none of those is sent. Values are the player's CURRENT figures -
 * Bloxity keeps the high-water mark itself - and a value that is not finite,
 * is negative or is over its type's ceiling is OMITTED, never clamped: a
 * clamped value would become a permanent maximum at exactly the limit.
 *
 * Inert unless the pod carries `BLOXITY_REPORT_TOKEN` and `BLOXITY_GAME_ID`
 * (a Bloxity-hosted deployment), so local development reports nothing.
 */
type StatType = 'number' | 'seconds' | 'currency' | 'percent';

interface StatDefinition {
  readonly key: string;
  readonly label: string;
  readonly type: StatType;
  readonly sortOrder: number;
}

/** Declared on every call: repeating is free and keeps the labels current. */
export const STAT_DEFINITIONS: readonly StatDefinition[] = [
  { key: 'cash', label: 'Cash', type: 'currency', sortOrder: 1 },
  { key: 'lifetime_earnings', label: 'Lifetime Earnings', type: 'currency', sortOrder: 2 },
  { key: 'deliveries', label: 'Parcels Delivered', type: 'number', sortOrder: 3 },
  { key: 'taxi_fares', label: 'Taxi Fares', type: 'number', sortOrder: 4 },
  { key: 'arrests', label: 'Arrests Made', type: 'number', sortOrder: 5 },
  { key: 'patients_treated', label: 'Patients Treated', type: 'number', sortOrder: 6 },
  { key: 'orders_served', label: 'Orders Served', type: 'number', sortOrder: 7 },
  { key: 'fish_caught', label: 'Fish Caught', type: 'number', sortOrder: 8 },
  { key: 'vehicles_owned', label: 'Vehicles Owned', type: 'number', sortOrder: 9 },
  { key: 'homes_owned', label: 'Home Styles Owned', type: 'number', sortOrder: 10 },
];

/** Bloxity REJECTS anything above these (per type). */
const CEILING: Readonly<Record<StatType, number>> = {
  number: 1_000_000_000,
  seconds: 31_536_000_000,
  currency: 1_000_000_000_000,
  percent: 100,
};

const TYPE_OF = new Map(STAT_DEFINITIONS.map((definition) => [definition.key, definition.type]));

export type StatValues = Record<string, number>;

export interface StatRow {
  readonly userId: string;
  readonly values: StatValues;
}

/** Players per request (Bloxity answers 413 past 200). */
const BATCH = 200;
const INTERVAL_MS = 60_000;
const TIMEOUT_MS = 8_000;

/**
 * The Bloxity identity for a VERIFIED account id, or null for a guest (who has
 * no Bloxity account to attach stats to). Bloxity files accounts as
 * `legion_<id>`; any `#m...` mode suffix is stripped so one player's stats are
 * never split in two.
 */
export const reportIdentityOf = (accountId: string | null | undefined): string | null => {
  if (!accountId) return null;
  const id = accountId.split('#m')[0]!.trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  return id.startsWith('legion_') ? id : `legion_${id}`;
};

/**
 * The reported figures, read straight off the server's own profile - the same
 * object the room's services mutate and the store persists. Never a packet.
 */
export const statValuesOf = (profile: ProgressFields): StatValues => ({
  cash: Math.floor(profile.money),
  lifetime_earnings: Math.floor(profile.earned),
  deliveries: profile.stats.deliveries,
  taxi_fares: profile.stats.fares,
  arrests: profile.stats.arrests,
  patients_treated: profile.stats.treated,
  orders_served: profile.stats.served,
  fish_caught: profile.stats.fish,
  vehicles_owned: profile.vehicles.length,
  // Townhouses are free for everyone: count the styles actually bought.
  homes_owned: profile.houseStyles.filter((style) => style !== 0).length,
});

/** Keep only values Bloxity will accept: declared, finite, not negative, under the ceiling. */
const validValues = (values: StatValues): StatValues | null => {
  const out: StatValues = {};
  let any = false;
  for (const [key, value] of Object.entries(values)) {
    const type = TYPE_OF.get(key);
    if (!type || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > CEILING[type]) continue;
    out[key] = value;
    any = true;
  }
  return any ? out : null;
};

/**
 * Where the rows come from: every live room registers a source (its connected
 * ACCOUNT players, read from state at flush time), and a player who leaves
 * hands over one last row, so their final figures are reported too.
 */
const sources = new Set<() => Iterable<StatRow>>();
const departed = new Map<string, StatValues>();

export const statRegistry = {
  addSource(source: () => Iterable<StatRow>): () => void {
    sources.add(source);
    return () => sources.delete(source);
  },
  /** A player leaving: report their last figures on the next flush. */
  depart(accountId: string | null, profile: ProgressFields): void {
    const userId = reportIdentityOf(accountId);
    if (userId) departed.set(userId, statValuesOf(profile));
  },
};

const collect = (): StatRow[] => {
  const rows = new Map<string, StatValues>(departed);
  departed.clear();
  for (const source of sources) {
    try {
      for (const row of source()) rows.set(row.userId, row.values);
    } catch (error) {
      logger.warn(SCOPE, `a stat source failed: ${String(error)}`);
    }
  }
  const out: StatRow[] = [];
  for (const [userId, values] of rows) {
    const valid = validValues(values);
    if (valid) out.push({ userId, values: valid });
  }
  return out;
};

export interface StatReporter {
  /** Report everyone now (the interval, and once more on shutdown / drain). Never throws. */
  flush(): Promise<void>;
  stop(): void;
}

const INERT: StatReporter = { flush: async () => undefined, stop: () => undefined };

/** Install once at server start. A no-op without the Bloxity reporting environment. */
export const installStatReporter = (): StatReporter => {
  const token = process.env['BLOXITY_REPORT_TOKEN']?.trim();
  const gameId = process.env['BLOXITY_GAME_ID']?.trim();
  if (!token || !gameId) {
    logger.info(SCOPE, 'stat reporting off (BLOXITY_REPORT_TOKEN / BLOXITY_GAME_ID not set)');
    return INERT;
  }
  const base = (process.env['BLOXITY_API_URL']?.trim() || 'https://api.bloxity.io').replace(/\/+$/, '');
  const url = `${base}/v1/games/${encodeURIComponent(gameId)}/stats`;

  const post = async (players: StatRow[]): Promise<void> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ definitions: STAT_DEFINITIONS, players }),
        signal: controller.signal,
      });
      const body = await response.text().catch(() => '');
      // The response is the only window into why a number is not on a profile: always logged.
      const line = `POST stats (${players.length} player(s)) -> ${response.status} ${body.slice(0, 500)}`;
      if (response.ok) logger.info(SCOPE, line);
      else logger.warn(SCOPE, line);
    } catch (error) {
      logger.warn(SCOPE, `stat report failed: ${String(error)}`);
    } finally {
      clearTimeout(timer);
    }
  };

  let flushing: Promise<void> | null = null;
  const flush = (): Promise<void> => {
    // One flush at a time; a shutdown flush waits for a running one, then runs its own.
    const run = async (): Promise<void> => {
      try {
        const rows = collect();
        for (let i = 0; i < rows.length; i += BATCH) await post(rows.slice(i, i + BATCH));
      } catch (error) {
        logger.warn(SCOPE, `stat flush failed: ${String(error)}`);
      }
    };
    flushing = (flushing ?? Promise.resolve()).then(run, run);
    return flushing;
  };

  const interval = setInterval(() => void flush(), INTERVAL_MS);
  interval.unref?.();
  logger.info(SCOPE, `stat reporting on for "${gameId}" every ${INTERVAL_MS / 1000}s`);
  return {
    flush,
    stop: () => clearInterval(interval),
  };
};
