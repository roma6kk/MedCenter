import type { DataSourceOptions } from 'typeorm';

import { ExternalLink } from '../modules/users/entities/external-link.entity';
import { OAuthClient } from '../modules/users/entities/oauth-client.entity';
import { OAuthToken } from '../modules/users/entities/oauth-token.entity';
import { Role } from '../modules/users/entities/role.entity';
import { User } from '../modules/users/entities/user.entity';
import { UserRole } from '../modules/users/entities/user-role.entity';
import { Init1700000000000 } from './migrations/1700000000000-Init';
import {
  AUTH_SCHEMA,
  authEntities,
  buildDataSource,
  buildTestDataSource,
  type PostgresConnectionOptions,
} from './typeorm.config';

const CONNECTION: PostgresConnectionOptions = {
  host: 'localhost',
  port: 5433,
  username: 'medcenter',
  password: 'secret',
  database: 'auth_test',
};

describe('auth data source factory', () => {
  it('should name the auth schema explicitly', () => {
    expect(AUTH_SCHEMA).toBe('auth');
  });

  it('should register all six auth entities in dependency order', () => {
    expect(authEntities).toEqual([User, Role, UserRole, ExternalLink, OAuthClient, OAuthToken]);
  });

  it('should build a postgres source pinned to the auth schema without synchronize', () => {
    const options = buildDataSource(CONNECTION).options as DataSourceOptions & {
      readonly schema?: string;
      readonly synchronize?: boolean;
    };

    expect(options.type).toBe('postgres');
    expect(options.schema).toBe('auth');
    expect(options.synchronize).toBe(false);
  });

  it('should run the single Init migration instead of syncing the schema', () => {
    const options = buildDataSource(CONNECTION).options;

    expect(options.migrations).toEqual([Init1700000000000]);
  });

  it('should pass the connection options straight through to postgres', () => {
    const options = buildDataSource(CONNECTION).options as DataSourceOptions &
      PostgresConnectionOptions;

    expect(options.host).toBe('localhost');
    expect(options.port).toBe(5433);
    expect(options.username).toBe('medcenter');
    expect(options.database).toBe('auth_test');
  });

  it('should create a fresh instance for runtime and for tests with identical options', () => {
    const runtime = buildDataSource(CONNECTION);
    const test = buildTestDataSource(CONNECTION);

    expect(runtime).not.toBe(test);
    expect(runtime.options).toEqual(test.options);
  });
});
