import { Inject, Injectable, Logger, type OnApplicationShutdown, type Provider } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { parseDatabaseEnv } from '../config/auth-env';
import { buildDataSource, type PostgresConnectionOptions } from './typeorm.config';

export const AUTH_DATA_SOURCE = Symbol('AUTH_DATA_SOURCE');

/**
 * Opens the `auth` schema and applies pending migrations before the service
 * accepts traffic (never `synchronize`). The schema must exist before TypeORM
 * creates its migrations table inside it.
 */
export async function openAuthDataSource(connection: PostgresConnectionOptions): Promise<DataSource> {
  const dataSource = await buildDataSource(connection).initialize();
  try {
    await dataSource.query('CREATE SCHEMA IF NOT EXISTS "auth"');
    await dataSource.runMigrations({ transaction: 'each' });
  } catch (error: unknown) {
    await dataSource.destroy();
    throw error;
  }
  return dataSource;
}

/** Eager: a wrong connection or a failing migration fails the boot, not the first request. */
export const authDataSourceProvider: Provider = {
  provide: AUTH_DATA_SOURCE,
  useFactory: (): Promise<DataSource> => openAuthDataSource(parseDatabaseEnv(process.env)),
};

/** Closes the pool on shutdown so `enableShutdownHooks()` drains cleanly. */
@Injectable()
export class AuthDataSourceCloser implements OnApplicationShutdown {
  private readonly logger = new Logger(AuthDataSourceCloser.name);

  constructor(@Inject(AUTH_DATA_SOURCE) private readonly dataSource: DataSource) {}

  async onApplicationShutdown(): Promise<void> {
    if (!this.dataSource.isInitialized) {
      return;
    }
    await this.dataSource.destroy().catch((error: unknown) => {
      this.logger.warn({ err: error }, 'auth DataSource did not close cleanly');
    });
  }
}
