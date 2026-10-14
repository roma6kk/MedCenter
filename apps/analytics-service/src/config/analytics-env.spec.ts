import { DEFAULT_AUDIT_SYNC_INTERVAL_MS, parseAuditSyncEnv, parseDatabaseEnv, parseWorkerEnv } from './analytics-env';

describe('parseDatabaseEnv', () => {
  it('should read the compose DB_* keys when they are set', () => {
    const connection = parseDatabaseEnv({
      DB_HOST: 'postgres',
      DB_PORT: '5432',
      DB_USERNAME: 'medcenter',
      DB_PASSWORD: 'secret-value',
      DB_NAME: 'medcenter',
    });

    expect(connection).toEqual({
      host: 'postgres',
      port: 5432,
      username: 'medcenter',
      password: 'secret-value',
      database: 'medcenter',
    });
  });

  it('should fall back to the POSTGRES_* keys when a host-run service has no DB_* keys', () => {
    const connection = parseDatabaseEnv({ POSTGRES_PASSWORD: 'pw', POSTGRES_PORT: '5433', POSTGRES_USER: 'u' });

    expect(connection).toMatchObject({ host: 'localhost', port: 5433, username: 'u', password: 'pw', database: 'medcenter' });
  });

  it('should fail the boot when no database password is configured', () => {
    expect(() => parseDatabaseEnv({ DB_HOST: 'postgres' })).toThrow('DB_PASSWORD');
  });

  it('should treat an empty variable as unset when the key is present but blank', () => {
    expect(() => parseDatabaseEnv({ DB_PASSWORD: '' })).toThrow('DB_PASSWORD');
  });

  it('should reject a port outside 1..65535 when DB_PORT is malformed', () => {
    expect(() => parseDatabaseEnv({ DB_PASSWORD: 'pw', DB_PORT: '70000' })).toThrow();
  });
});

describe('parseWorkerEnv', () => {
  it('should enable the consumer by default when CONSUMER_ENABLED is absent', () => {
    expect(parseWorkerEnv({ RABBITMQ_URL: 'amqp://rabbitmq:5672' })).toEqual({
      enabled: true,
      rabbitmqUrl: 'amqp://rabbitmq:5672',
    });
  });

  it('should disable the consumer when CONSUMER_ENABLED is false', () => {
    expect(parseWorkerEnv({ CONSUMER_ENABLED: 'false' })).toEqual({ enabled: false, rabbitmqUrl: undefined });
  });

  it('should fail the boot when the consumer is enabled without a broker URL', () => {
    expect(() => parseWorkerEnv({})).toThrow('RABBITMQ_URL');
  });

  it('should reject an unknown flag value when CONSUMER_ENABLED is not a boolean', () => {
    expect(() => parseWorkerEnv({ CONSUMER_ENABLED: 'maybe', RABBITMQ_URL: 'amqp://x' })).toThrow();
  });
});

describe('parseAuditSyncEnv', () => {
  it('should poll HAPI every 15 seconds by default when no interval is configured', () => {
    expect(parseAuditSyncEnv({})).toEqual({ enabled: true, intervalMs: DEFAULT_AUDIT_SYNC_INTERVAL_MS });
    expect(DEFAULT_AUDIT_SYNC_INTERVAL_MS).toBe(15_000);
  });

  it('should honour AUDIT_SYNC_ENABLED=false and a custom interval when both are set', () => {
    expect(parseAuditSyncEnv({ AUDIT_SYNC_ENABLED: 'false', AUDIT_SYNC_INTERVAL_MS: '60000' })).toEqual({
      enabled: false,
      intervalMs: 60_000,
    });
  });

  it('should reject an interval below one second when it would hammer HAPI', () => {
    expect(() => parseAuditSyncEnv({ AUDIT_SYNC_INTERVAL_MS: '10' })).toThrow();
  });
});
