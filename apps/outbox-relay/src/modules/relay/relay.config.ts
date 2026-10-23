/** Tunables of the relay; every value has a default so the stack needs no extra variables. */
export interface RelayConfig {
  /** Pause between two polls. */
  readonly pollIntervalMs: number;
  /** Records read, published and marked per round trip (`_count`). */
  readonly batchSize: number;
  /** Redis lock lifetime; a crashed relay frees the lock after this long. */
  readonly lockTtlMs: number;
  /** `sent` records older than this are deleted and expunged. */
  readonly retentionMs: number;
  /** A `pending` record older than this is logged as stuck. */
  readonly stalePendingMs: number;
  /** How often cleanup and the stuck-record check run. */
  readonly housekeepingIntervalMs: number;
}

export const RELAY_CONFIG = Symbol('RELAY_CONFIG');

const DAY_MS = 24 * 60 * 60 * 1000;

function positiveInt(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer, got "${raw}"`);
  }
  return value;
}

/** A bad value fails the service at startup, never silently on the first poll. */
export function parseRelayConfig(env: NodeJS.ProcessEnv = process.env): RelayConfig {
  return {
    pollIntervalMs: positiveInt(env, 'OUTBOX_POLL_INTERVAL_MS', 2_000),
    batchSize: positiveInt(env, 'OUTBOX_BATCH_SIZE', 50),
    lockTtlMs: positiveInt(env, 'OUTBOX_LOCK_TTL_MS', 30_000),
    retentionMs: positiveInt(env, 'OUTBOX_RETENTION_DAYS', 7) * DAY_MS,
    stalePendingMs: 5 * 60 * 1000,
    housekeepingIntervalMs: positiveInt(env, 'OUTBOX_HOUSEKEEPING_INTERVAL_MS', 60_000),
  };
}
