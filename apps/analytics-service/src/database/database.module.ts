import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { parseDatabaseEnv } from '../config/analytics-env';
import { ANALYTICS_DATA_SOURCE } from './database.tokens';
import { openAnalyticsDataSource } from './typeorm.config';

/**
 * Owns the read-model connection. The provider opens and migrates the schema
 * before the application starts listening, so a broken database fails the
 * boot (the container restarts) instead of every request.
 */
@Global()
@Module({
  providers: [
    {
      provide: ANALYTICS_DATA_SOURCE,
      useFactory: (): Promise<DataSource> => openAnalyticsDataSource(parseDatabaseEnv(process.env)),
    },
  ],
  exports: [ANALYTICS_DATA_SOURCE],
})
export class DatabaseModule implements OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@Inject(ANALYTICS_DATA_SOURCE) private readonly dataSource: DataSource) {}

  async onApplicationShutdown(): Promise<void> {
    if (!this.dataSource.isInitialized) {
      return;
    }
    await this.dataSource.destroy().catch((error: unknown) => {
      this.logger.warn({ err: error }, 'analytics read-model connection did not close cleanly');
    });
  }
}
