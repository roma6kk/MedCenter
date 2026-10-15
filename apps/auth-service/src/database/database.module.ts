import { Module } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { TypeOrmUserStore } from '../modules/users/store/typeorm-user.store';
import { USER_STORE, type UserStore } from '../modules/users/store/user-store';
import { AUTH_DATA_SOURCE, AuthDataSourceCloser, authDataSourceProvider } from './database.providers';

/**
 * Persistence of the `auth` schema. `@nestjs/typeorm` is not used on purpose:
 * it ships ESM the CJS Jest pipeline cannot load, and the service needs only
 * one DataSource behind one port (`USER_STORE`), which e2e suites override.
 */
@Module({
  providers: [
    authDataSourceProvider,
    AuthDataSourceCloser,
    {
      provide: USER_STORE,
      useFactory: (dataSource: DataSource): UserStore => new TypeOrmUserStore(dataSource),
      inject: [AUTH_DATA_SOURCE],
    },
  ],
  exports: [USER_STORE],
})
export class DatabaseModule {}
