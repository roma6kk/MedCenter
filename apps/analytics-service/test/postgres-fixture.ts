import { existsSync } from 'node:fs';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { DataSource } from 'typeorm';

import { openAnalyticsDataSource } from '../src/database/typeorm.config';

const hasDocker = existsSync('/var/run/docker.sock') || process.env['DOCKER_HOST'] !== undefined;

// A skipped suite is silent in CI, so the skip is announced: its SQL is then visibly uncovered.
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
