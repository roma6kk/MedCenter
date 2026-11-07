import { spawnSync } from 'node:child_process';
import { DataSource } from 'typeorm';

import { buildTestDataSource, type PostgresConnectionOptions } from '../typeorm.config';

export function testConnectionOptions(database = 'postgres'): PostgresConnectionOptions {
  return {
    host: process.env['TEST_PG_HOST'] ?? '127.0.0.1',
    port: Number(process.env['TEST_PG_PORT'] ?? 5433),
    username: process.env['TEST_PG_USER'] ?? 'medcenter',
    password: process.env['TEST_PG_PASSWORD'] ?? 'change-me-postgres',
    database,
  };
}

export function isPostgresAvailable(): boolean {
  const { host, port, username, password, database } = testConnectionOptions();
  const clientConfig = { host, port, user: username, password, database, connectionTimeoutMillis: 1500 };
  const script = [
    `const { Client } = require(${JSON.stringify(require.resolve('pg'))});`,
    `const client = new Client(${JSON.stringify(clientConfig)});`,
    'client.connect().then(() => client.end()).then(() => process.exit(0), () => process.exit(1));',
  ].join('');
  const result = spawnSync(process.execPath, ['-e', script], { timeout: 5000 });
  return result.status === 0;
}

export function warnPostgresUnavailable(suite: string): void {
  // eslint-disable-next-line no-console
  console.warn(
    `[${suite}] PostgreSQL is not reachable with the TEST_PG_* credentials — skipping the integration suite.`,
  );
}

export async function createMigratedDatabase(database: string): Promise<DataSource> {
  const admin = await new DataSource({ type: 'postgres', ...testConnectionOptions() }).initialize();
  await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
  await admin.query(`CREATE DATABASE "${database}"`);
  await admin.destroy();

  const dataSource = await buildTestDataSource(testConnectionOptions(database)).initialize();
  await dataSource.query('CREATE SCHEMA IF NOT EXISTS "auth"');
  await dataSource.runMigrations();
  return dataSource;
}

export async function dropDatabase(dataSource: DataSource | undefined, database: string): Promise<void> {
  if (dataSource?.isInitialized) {
    await dataSource.destroy();
  }
  const admin = await new DataSource({ type: 'postgres', ...testConnectionOptions() }).initialize();
  await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
  await admin.destroy();
}
