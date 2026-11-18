export interface RelayConfig {
  readonly pollIntervalMs: number;
  readonly batchSize: number;
  readonly lockTtlMs: number;
  readonly retentionMs: number;
  readonly stalePendingMs: number;
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

export function parseRelayConfig(env: NodeJS.ProcessEnv = process.env): RelayConfig {
  return {
    pollIntervalMs: positiveInt(env, 'OUTBOX_POLL_INTERVAL_MS', 2_000),
    batchSize: positiveInt(env, 'OUTBOX_BATCH_SIZE', 50),
    lockTtlMs: positiveInt(env, 'OUTBOX_LOCK_TTL_MS', 30_000),
    // OUTBOX_RETENTION_MS wins over the days: it exists for live verification of the purge, not for production.
    retentionMs: positiveInt(env, 'OUTBOX_RETENTION_MS', positiveInt(env, 'OUTBOX_RETENTION_DAYS', 7) * DAY_MS),
    stalePendingMs: positiveInt(env, 'OUTBOX_STALE_PENDING_MS', 5 * 60 * 1000),
    housekeepingIntervalMs: positiveInt(env, 'OUTBOX_HOUSEKEEPING_INTERVAL_MS', 60_000),
  };
}
