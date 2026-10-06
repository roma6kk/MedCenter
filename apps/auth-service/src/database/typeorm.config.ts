import { DataSource, type DataSourceOptions } from 'typeorm';

import { ExternalLink } from '../modules/users/entities/external-link.entity';
import { OAuthClient } from '../modules/users/entities/oauth-client.entity';
import { OAuthToken } from '../modules/users/entities/oauth-token.entity';
import { Role } from '../modules/users/entities/role.entity';
import { User } from '../modules/users/entities/user.entity';
import { UserRole } from '../modules/users/entities/user-role.entity';
import { Init1700000000000 } from './migrations/1700000000000-Init';

export const AUTH_SCHEMA = 'auth';

export const authEntities = [User, Role, UserRole, ExternalLink, OAuthClient, OAuthToken];

export interface PostgresConnectionOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

function baseOptions(connection: PostgresConnectionOptions): DataSourceOptions {
  return {
    type: 'postgres',
    ...connection,
    schema: AUTH_SCHEMA,
    entities: authEntities,
    migrations: [Init1700000000000],
    synchronize: false,
  };
}

/** Runtime DataSource: migrations run explicitly at startup (never `synchronize`). */
export function buildDataSource(connection: PostgresConnectionOptions): DataSource {
  return new DataSource(baseOptions(connection));
}

/** Test DataSource: same entities + migration path as production. */
export function buildTestDataSource(connection: PostgresConnectionOptions): DataSource {
  return new DataSource(baseOptions(connection));
}
