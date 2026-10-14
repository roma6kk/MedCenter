import { z } from 'zod';

/**
 * Environment of the analytics-specific infrastructure: the `analytics`
 * read-model connection, the RabbitMQ worker and the HAPI `AuditEvent` sync.
 * Secrets have no defaults and are only ever read from the environment.
 */

/** An empty variable (`FOO=`) means "unset", never an empty secret or host. */
const blankAsUnset = (value: unknown): unknown => (value === '' ? undefined : value);

const optionalText = z.preprocess(blankAsUnset, z.string().min(1).optional());
const optionalPort = z.preprocess(blankAsUnset, z.coerce.number().int().min(1).max(65535).optional());
const optionalFlag = z.preprocess(blankAsUnset, z.enum(['true', 'false', '1', '0']).optional());

const databaseEnvSchema = z.object({
  DB_HOST: optionalText,
  DB_PORT: optionalPort,
  DB_USERNAME: optionalText,
  DB_PASSWORD: optionalText,
  DB_NAME: optionalText,
  POSTGRES_PORT: optionalPort,
  POSTGRES_USER: optionalText,
  POSTGRES_PASSWORD: optionalText,
  POSTGRES_DB: optionalText,
});

export interface DatabaseConnection {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly database: string;
}

/**
 * `DB_*` (docker-compose `x-db-env`) wins; the compose-level `POSTGRES_*` keys
 * are the fallback so a host-run service (`nx serve`) works with the stack's
 * own environment.
 */
export function parseDatabaseEnv(source: NodeJS.ProcessEnv): DatabaseConnection {
  const env = databaseEnvSchema.parse(source);
  const password = env.DB_PASSWORD ?? env.POSTGRES_PASSWORD;
  if (password === undefined) {
    throw new Error('DB_PASSWORD (or POSTGRES_PASSWORD) is required to open the analytics read-model');
  }
  return {
    host: env.DB_HOST ?? 'localhost',
    port: env.DB_PORT ?? env.POSTGRES_PORT ?? 5432,
    username: env.DB_USERNAME ?? env.POSTGRES_USER ?? 'medcenter',
    password,
    database: env.DB_NAME ?? env.POSTGRES_DB ?? 'medcenter',
  };
}

function isOn(flag: string | undefined): boolean {
  return flag === undefined || flag === 'true' || flag === '1';
}

export interface WorkerConfig {
  readonly enabled: boolean;
  readonly rabbitmqUrl: string | undefined;
}

export const WORKER_CONFIG = Symbol('WORKER_CONFIG');

const workerEnvSchema = z.object({
  CONSUMER_ENABLED: optionalFlag,
  RABBITMQ_URL: z.preprocess(blankAsUnset, z.url().optional()),
});

/** `CONSUMER_ENABLED=false` switches the RabbitMQ worker off (e2e suites, read-only replicas). */
export function parseWorkerEnv(source: NodeJS.ProcessEnv): WorkerConfig {
  const env = workerEnvSchema.parse(source);
  const enabled = isOn(env.CONSUMER_ENABLED);
  if (enabled && env.RABBITMQ_URL === undefined) {
    throw new Error('RABBITMQ_URL is required while the analytics worker is enabled (CONSUMER_ENABLED)');
  }
  return { enabled, rabbitmqUrl: env.RABBITMQ_URL };
}

export interface AuditSyncConfig {
  readonly enabled: boolean;
  readonly intervalMs: number;
}

export const AUDIT_SYNC_CONFIG = Symbol('AUDIT_SYNC_CONFIG');

/** How often the journal read-model pulls new `AuditEvent`s from HAPI. */
export const DEFAULT_AUDIT_SYNC_INTERVAL_MS = 15_000;

const auditSyncEnvSchema = z.object({
  AUDIT_SYNC_ENABLED: optionalFlag,
  AUDIT_SYNC_INTERVAL_MS: z.preprocess(blankAsUnset, z.coerce.number().int().min(1_000).max(3_600_000).optional()),
});

export function parseAuditSyncEnv(source: NodeJS.ProcessEnv): AuditSyncConfig {
  const env = auditSyncEnvSchema.parse(source);
  return {
    enabled: isOn(env.AUDIT_SYNC_ENABLED),
    intervalMs: env.AUDIT_SYNC_INTERVAL_MS ?? DEFAULT_AUDIT_SYNC_INTERVAL_MS,
  };
}
