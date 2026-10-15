import { spawnSync } from 'node:child_process';
import { DataSource } from 'typeorm';

import { buildTestDataSource, type PostgresConnectionOptions } from '../typeorm.config';

/**
 * Connection of the integration suites. Credentials come from `TEST_PG_*`
 * only — never from an env file on disk — and default to the compose stack's
 * published port (5433 in this checkout) with the documented dev password.
 */
export function testConnectionOptions(database = 'postgres'): PostgresConnectionOptions {
  return {
    host: process.env['TEST_PG_HOST'] ?? '127.0.0.1',
    port: Number(process.env['TEST_PG_PORT'] ?? 5433),
    username: process.env['TEST_PG_USER'] ?? 'medcenter',
    password: process.env['TEST_PG_PASSWORD'] ?? 'change-me-postgres',
    database,
  };
}

/**
 * Synchronous probe run at collection time (Jest registers `describe`/`it`
 * synchronously, so an async `beforeAll` probe would be too late to skip).
 * A child `node` process opens a real `pg` session, so a reachable server
 * that rejects the credentials skips the suite instead of failing it.
 */
export function isPostgresAvailable(): boolean {
  const { host, port, username, password, database } = testConnectionOptions();
  // `pg.Client` names the role `user`, not TypeORM's `username`.
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

/** Recreates `database` from scratch, then applies every `auth` migration to it. */
export async function createMigratedDatabase(database: string): Promise<DataSource> {
  const admin = await new DataSource({ type: 'postgres', ...testConnectionOptions() }).initialize();
  await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
  await admin.query(`CREATE DATABASE "${database}"`);
  await admin.destroy();

  const dataSource = await buildTestDataSource(testConnectionOptions(database)).initialize();
  // TypeORM keeps its migrations table in the `auth` schema, which must exist first.
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
