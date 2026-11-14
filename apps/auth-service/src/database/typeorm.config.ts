import { DataSource, type DataSourceOptions } from 'typeorm';

import { ExternalLink } from '../modules/users/entities/external-link.entity';
import { OAuthClient } from '../modules/users/entities/oauth-client.entity';
import { OAuthToken } from '../modules/users/entities/oauth-token.entity';
import { Role } from '../modules/users/entities/role.entity';
import { User } from '../modules/users/entities/user.entity';
import { UserRole } from '../modules/users/entities/user-role.entity';
import { Init1700000000000 } from './migrations/1700000000000-Init';
import { RolesAndLinks1700000000001 } from './migrations/1700000000001-RolesAndLinks';
import { AccountConsent1700000000002 } from './migrations/1700000000002-AccountConsent';
import { AccountConsentWithdrawal1700000000003 } from './migrations/1700000000003-AccountConsentWithdrawal';

export const AUTH_SCHEMA = 'auth';

export const authEntities = [User, Role, UserRole, ExternalLink, OAuthClient, OAuthToken];

const authMigrations = [Init1700000000000, RolesAndLinks1700000000001, AccountConsent1700000000002, AccountConsentWithdrawal1700000000003];

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
    migrations: authMigrations,
    synchronize: false,
  };
}

export function buildDataSource(connection: PostgresConnectionOptions): DataSource {
  return new DataSource(baseOptions(connection));
}

export const buildTestDataSource: typeof buildDataSource = buildDataSource;
