import type { DataSource, DataSourceOptions } from 'typeorm';

import type { DatabaseConnection } from '../config/analytics-env';
import { AppointmentFactEntity } from './entities/appointment-fact.entity';
import { AuditEventReadEntity } from './entities/audit-event-read.entity';
import { EncounterFactEntity } from './entities/encounter-fact.entity';
import { ProcessedEventEntity } from './entities/processed-event.entity';
import { SyncCursorEntity } from './entities/sync-cursor.entity';
import { AnalyticsInit1760342400000 } from './migrations/1760342400000-AnalyticsInit';
import { AuditReadActions1761120000000 } from './migrations/1761120000000-AuditReadActions';
import { AuditEmergencyBypass1761206400000 } from './migrations/1761206400000-AuditEmergencyBypass';
import { ANALYTICS_ENTITIES, buildAnalyticsDataSource, migrateAnalyticsSchema } from './typeorm.config';

const CONNECTION: DatabaseConnection = {
  host: 'localhost',
  port: 5433,
  username: 'medcenter',
  password: 'secret',
  database: 'analytics_test',
};

type Options = DataSourceOptions & { readonly schema?: string; readonly synchronize?: boolean };

function fakeDataSource(): { readonly dataSource: DataSource; readonly runner: { query: jest.Mock; release: jest.Mock; connect: jest.Mock }; readonly runMigrations: jest.Mock } {
  const runner = { query: jest.fn().mockResolvedValue([]), release: jest.fn().mockResolvedValue(undefined), connect: jest.fn().mockResolvedValue(undefined) };
  const runMigrations = jest.fn().mockResolvedValue([]);
  const dataSource = { createQueryRunner: () => runner, runMigrations } as unknown as DataSource;
  return { dataSource, runner, runMigrations };
}

describe('analytics data source factory', () => {
  it('should register the five read-model entities when the source is built', () => {
    expect(ANALYTICS_ENTITIES).toEqual([
      ProcessedEventEntity,
      AppointmentFactEntity,
      EncounterFactEntity,
      AuditEventReadEntity,
      SyncCursorEntity,
    ]);
  });

  it('should pin the source to the analytics schema without synchronize when built for runtime', () => {
    const options = buildAnalyticsDataSource(CONNECTION).options as Options;

    expect(options.type).toBe('postgres');
    expect(options.schema).toBe('analytics');
    expect(options.synchronize).toBe(false);
    expect(options.migrations).toEqual([AnalyticsInit1760342400000, AuditReadActions1761120000000, AuditEmergencyBypass1761206400000]);
  });

  it('should pass the connection options straight through when built', () => {
    const options = buildAnalyticsDataSource(CONNECTION).options as Options & DatabaseConnection;

    expect(options).toMatchObject(CONNECTION);
  });
});

describe('migrateAnalyticsSchema', () => {
  it('should create the schema and migrate under an advisory lock when replicas start together', async () => {
    const { dataSource, runner, runMigrations } = fakeDataSource();

    await migrateAnalyticsSchema(dataSource);

    const queries = runner.query.mock.calls.map((call: ReadonlyArray<unknown>) => String(call[0]));
    expect(queries[0]).toContain('pg_advisory_lock');
    expect(queries[1]).toBe('CREATE SCHEMA IF NOT EXISTS "analytics"');
    expect(queries[2]).toContain('pg_advisory_unlock');
    expect(runMigrations).toHaveBeenCalledWith({ transaction: 'each' });
    expect(runner.release).toHaveBeenCalled();
  });

  it('should release the lock and the runner when a migration fails', async () => {
    const { dataSource, runner, runMigrations } = fakeDataSource();
    runMigrations.mockRejectedValue(new Error('migration broke'));

    await expect(migrateAnalyticsSchema(dataSource)).rejects.toThrow('migration broke');
    expect(runner.query.mock.calls.some((call: ReadonlyArray<unknown>) => String(call[0]).includes('pg_advisory_unlock'))).toBe(true);
    expect(runner.release).toHaveBeenCalled();
  });
});
