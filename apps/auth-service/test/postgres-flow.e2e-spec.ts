import type { INestApplication } from '@nestjs/common';
import { Role } from '@medcenter/contracts';
import request from 'supertest';
import type { DataSource } from 'typeorm';

import {
  createMigratedDatabase,
  dropDatabase,
  isPostgresAvailable,
  testConnectionOptions,
  warnPostgresUnavailable,
} from '../src/database/__tests__/pg-test-connection';
import { startAuthApp } from './app-harness';
import { PATIENT_PASSWORD, bearer, claimsOfToken, signIn } from './auth-flow-helpers';

// `jose` is pure ESM and Jest's CJS runtime cannot load it; the signature check is stubbed and the
// claims are decoded from the token the application actually signed (see `oauth.e2e-spec.ts`).
jest.mock('jose', () => ({
  createRemoteJWKSet: () => 'mocked-jwks',
  jwtVerify: async (token: string) => {
    const segment = token.split('.')[1] ?? '';
    const payload: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    return { payload, protectedHeader: { alg: 'RS256' } };
  },
}));

/**
 * The first-stack journey over the production persistence: the app opens the
 * `auth` schema itself, bootstraps the administrator from the environment and
 * serves registration and the browser login against PostgreSQL. Skipped when
 * `TEST_PG_*` does not reach a server (see `pg-test-connection.ts`).
 */
const DATABASE = 'auth_flow_e2e';
const ADMIN = { email: 'admin@medcenter.by', password: 'Adm1n!Passw0rd' } as const;
const postgresAvailable = isPostgresAvailable();

if (!postgresAvailable) {
  warnPostgresUnavailable('postgres-flow.e2e-spec');
}

const describePostgres = postgresAvailable ? describe : describe.skip;

function pointAppAtDatabase(): void {
  const { host, port, username, password } = testConnectionOptions();
  process.env['AUTH_DB_HOST'] = host;
  process.env['AUTH_DB_PORT'] = String(port);
  process.env['AUTH_DB_USER'] = username;
  process.env['AUTH_DB_PASSWORD'] = password;
  process.env['AUTH_DB_NAME'] = DATABASE;
  process.env['BOOTSTRAP_ADMIN_EMAIL'] = ADMIN.email;
  process.env['BOOTSTRAP_ADMIN_PASSWORD'] = ADMIN.password;
}

function releaseEnvironment(): void {
  for (const key of ['AUTH_DB_HOST', 'AUTH_DB_PORT', 'AUTH_DB_USER', 'AUTH_DB_PASSWORD', 'AUTH_DB_NAME', 'BOOTSTRAP_ADMIN_EMAIL', 'BOOTSTRAP_ADMIN_PASSWORD']) {
    delete process.env[key];
  }
}

describePostgres('First-stack journey over PostgreSQL', () => {
  let database: DataSource;
  let app: INestApplication;

  const api = (): ReturnType<typeof request> => request(app.getHttpServer());

  beforeAll(async () => {
    database = await createMigratedDatabase(DATABASE);
    pointAppAtDatabase();
    app = (await startAuthApp({ realDatabase: true })).app;
  });

  afterAll(async () => {
    await app?.close();
    releaseEnvironment();
    await dropDatabase(database, DATABASE);
  });

  it('should let the bootstrapped administrator sign in on a fresh database', async () => {
    const token = await signIn(app, ADMIN);

    expect(claimsOfToken(token)).toMatchObject({ role: Role.ADMIN, scope: 'launch user/*.read user/*.write' });
  });

  it('should register a patient, store a scrypt hash and sign them in with patient and fhirUser claims', async () => {
    const registered = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'Ivanov@Example.by', firstName: 'Иван', lastName: 'Иванов', password: PATIENT_PASSWORD, birthDate: '1990-05-12', accountConsent: { accepted: true, textVersion: '2026-10' } })
      .expect(201);
    const patientId = String(registered.body.patientRef).replace('Patient/', '');

    const token = await signIn(app, { email: 'ivanov@example.by', password: PATIENT_PASSWORD });
    const me = await api().get('/api/v1/me').set('authorization', bearer(token)).expect(200);

    expect(claimsOfToken(token)).toMatchObject({ role: Role.PATIENT, patient: patientId, fhirUser: `Patient/${patientId}` });
    expect(me.body.externalLinks).toEqual([{ resourceType: 'Patient', resourceId: patientId, reference: `Patient/${patientId}` }]);
    const [row] = await database.query<Array<{ email: string; password_hash: string }>>(
      'SELECT "email", "password_hash" FROM "auth"."user" WHERE "email" = $1',
      ['ivanov@example.by'],
    );
    expect(row?.password_hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[\w-]+\$[\w-]+$/);
    expect(row?.password_hash).not.toContain(PATIENT_PASSWORD);
  });

  it('should answer 409 EMAIL_TAKEN for the same email in another letter case', async () => {
    const response = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'IVANOV@example.by', firstName: 'Иван', lastName: 'Иванов', password: PATIENT_PASSWORD, birthDate: '1990-05-12', accountConsent: { accepted: true, textVersion: '2026-10' } })
      .expect(409);

    expect(response.body.detail).toContain('EMAIL_TAKEN');
  });

  it('should keep a single administrator when the service boots again on the same database', async () => {
    const second = (await startAuthApp({ realDatabase: true })).app;
    await second.close();

    const [{ count }] = await database.query<Array<{ count: string }>>(
      `SELECT count(*) AS "count" FROM "auth"."user" WHERE "email" = $1`,
      [ADMIN.email],
    );

    expect(count).toBe('1');
  });

  it('should list users with their roles through the admin API', async () => {
    const admin = await signIn(app, ADMIN);

    const response = await api().get('/api/v1/admin/users?role=PATIENT').set('authorization', bearer(admin)).expect(200);

    expect(response.body.items.map((item: { email: string }) => item.email)).toEqual(['ivanov@example.by']);
  });
});
