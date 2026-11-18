import { DataSource } from 'typeorm';

import type { DatabaseConnection } from '../config/analytics-env';
import { ANALYTICS_SCHEMA } from './analytics-schema';
import { AppointmentFactEntity } from './entities/appointment-fact.entity';
import { AuditEventReadEntity } from './entities/audit-event-read.entity';
import { EncounterFactEntity } from './entities/encounter-fact.entity';
import { ProcessedEventEntity } from './entities/processed-event.entity';
import { SyncCursorEntity } from './entities/sync-cursor.entity';
import { AnalyticsInit1760342400000 } from './migrations/1760342400000-AnalyticsInit';
import { AuditReadActions1761120000000 } from './migrations/1761120000000-AuditReadActions';
import { AuditAuthenticationActions1763078400000 } from './migrations/1763078400000-AuditAuthenticationActions';
import { AuditEmergencyBypass1761206400000 } from './migrations/1761206400000-AuditEmergencyBypass';

export const ANALYTICS_ENTITIES = [
  ProcessedEventEntity,
  AppointmentFactEntity,
  EncounterFactEntity,
  AuditEventReadEntity,
  SyncCursorEntity,
];

const MIGRATION_LOCK_KEY = 4_200_008;

export function buildAnalyticsDataSource(connection: DatabaseConnection): DataSource {
  return new DataSource({
    type: 'postgres',
    ...connection,
    schema: ANALYTICS_SCHEMA,
    entities: ANALYTICS_ENTITIES,
    migrations: [AnalyticsInit1760342400000, AuditReadActions1761120000000, AuditEmergencyBypass1761206400000, AuditAuthenticationActions1763078400000],
    synchronize: false,
  });
}

// The schema must exist before runMigrations (the migrations table lives in it); replicas are serialised by an advisory lock.
export async function migrateAnalyticsSchema(dataSource: DataSource): Promise<void> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  try {
    await runner.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    try {
      await runner.query(`CREATE SCHEMA IF NOT EXISTS "${ANALYTICS_SCHEMA}"`);
      await dataSource.runMigrations({ transaction: 'each' });
    } finally {
      await runner.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    }
  } finally {
    await runner.release();
  }
}

export async function openAnalyticsDataSource(connection: DatabaseConnection): Promise<DataSource> {
  const dataSource = await buildAnalyticsDataSource(connection).initialize();
  try {
    await migrateAnalyticsSchema(dataSource);
  } catch (error) {
    await dataSource.destroy();
    throw error;
  }
  return dataSource;
}
