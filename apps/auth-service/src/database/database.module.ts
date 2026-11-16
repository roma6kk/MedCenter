import { Module } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { CLINIC_STORE, TypeOrmClinicStore, type ClinicStore } from '../modules/clinic/clinic.store';
import { TypeOrmUserStore } from '../modules/users/store/typeorm-user.store';
import { USER_STORE, type UserStore } from '../modules/users/store/user-store';
import { AUTH_DATA_SOURCE, AuthDataSourceCloser, authDataSourceProvider } from './database.providers';

/** `@nestjs/typeorm` is not used on purpose: it ships ESM the CJS Jest pipeline cannot load. */
@Module({
  providers: [
    authDataSourceProvider,
    AuthDataSourceCloser,
    {
      provide: USER_STORE,
      useFactory: (dataSource: DataSource): UserStore => new TypeOrmUserStore(dataSource),
      inject: [AUTH_DATA_SOURCE],
    },
    {
      provide: CLINIC_STORE,
      useFactory: (dataSource: DataSource): ClinicStore => new TypeOrmClinicStore(dataSource),
      inject: [AUTH_DATA_SOURCE],
    },
  ],
  exports: [USER_STORE, CLINIC_STORE],
})
export class DatabaseModule {}
