import { existsSync } from 'node:fs';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { DataSource } from 'typeorm';

import { openAnalyticsDataSource } from '../src/database/typeorm.config';

/** Testcontainers needs a container runtime; without one the suites are skipped, not failed. */
const hasDocker = existsSync('/var/run/docker.sock') || process.env['DOCKER_HOST'] !== undefined;

/**
 * `describe` that needs Docker. A skipped suite is silent in a CI log, so the
 * skip is announced: the SQL it would have exercised is then visibly uncovered.
 */
export function describeWithDocker(name: string, suite: () => void): void {
  if (hasDocker) {
    describe(name, suite);
    return;
  }
  console.warn(`[analytics-service e2e] "${name}" SKIPPED: no container runtime (/var/run/docker.sock or DOCKER_HOST); its SQL is not exercised`);
  describe.skip(name, suite);
}

export interface ReadModelDatabase {
  readonly dataSource: DataSource;
  stop(): Promise<void>;
}

/** PostgreSQL 16 with the production migration applied (and re-applied by a second "replica" to prove it is a no-op). */
export async function startReadModelDatabase(): Promise<ReadModelDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
  const connection = {
    host: container.getHost(),
    port: container.getPort(),
    username: container.getUsername(),
    password: container.getPassword(),
    database: container.getDatabase(),
  };
  const dataSource = await openAnalyticsDataSource(connection);
  await (await openAnalyticsDataSource(connection)).destroy();
  return {
    dataSource,
    stop: async () => {
      await dataSource.destroy();
      await container.stop();
    },
  };
}
