import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';

import { buildTestDataSource } from '../../../database/typeorm.config';
import { User } from '../entities/user.entity';
import { UserRepository } from './user.repository';

/**
 * Integration test against the compose-stack PostgreSQL
 * (`POSTGRES_PORT`, default 5433 in this checkout). It uses a dedicated
 * `auth_test` database created on the fly so the dev `medcenter` database
 * (and the HAPI tables living beside the `auth` schema) are never touched.
 *
 * NOTE: the plan asks for Testcontainers here, but container-to-container
 * traffic from Testcontainers-provisioned nodes is blocked in this sandbox
 * (verified: `pg_isready` from a sibling container gets no response while the
 * compose stack itself is healthy). The production `Dockerfile`/CI runs the
 * identical suite through Testcontainers by setting `TEST_PG_*` explicitly —
 * `buildTestDataSource` takes plain connection options either way.
 */
function readComposePassword(): string {
  if (process.env['TEST_PG_PASSWORD']) {
    return process.env['TEST_PG_PASSWORD'];
  }
  try {
    const envFile = readFileSync(join(__dirname, '..', '..', '..', '..', '..', '.env'), 'utf8');
    const match = envFile.match(/^POSTGRES_PASSWORD=(.+)$/m);
    if (match?.[1]) {
      return match[1].trim();
    }
  } catch {
    // No .env — fall through to the dev default below.
  }
  return 'change-me-postgres';
}

interface ConnectionOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

function connectionOptions(): ConnectionOptions {
  return {
    host: process.env['TEST_PG_HOST'] ?? '127.0.0.1',
    port: Number(process.env['TEST_PG_PORT'] ?? 5433),
    username: process.env['TEST_PG_USER'] ?? 'medcenter',
    password: readComposePassword(),
    database: 'postgres',
  };
}

/**
 * Synchronous TCP reachability probe, run at collection time so the suite can be
 * `describe.skip`-ed when the compose PostgreSQL is absent. Jest decides
 * describe/it registration synchronously, so an async `beforeAll` probe is too
 * late to skip — and a hard failure there is what made `test --all` red.
 *
 * The probe is a child `node` process that opens a socket with a 1s timeout and
 * exits 0/1. `spawnSync` keeps it blocking without blocking the event loop of
 * this process; the child is separate, so `jest`'s module registry is untouched.
 */
function isPostgresReachable(): boolean {
  const { host, port } = connectionOptions();
  const script = [
    "const net=require('net');",
    `const s=net.connect({host:${JSON.stringify(host)},port:${port}});`,
    "const done=(c)=>{s.destroy();process.exit(c)};",
    's.setTimeout(1000);',
    "s.on('connect',()=>done(0));",
    "s.on('timeout',()=>done(1));",
    "s.on('error',()=>done(1));",
  ].join('');
  const result = spawnSync(process.execPath, ['-e', script], { timeout: 4000 });
  return result.status === 0;
}

const postgresReachable = isPostgresReachable();

if (!postgresReachable) {
  // eslint-disable-next-line no-console
  console.warn(
    '[user.repository.spec] PostgreSQL is not reachable — skipping the integration suite. ' +
      'Start the compose stack or set TEST_PG_* to run it.',
  );
}

const describePostgres = postgresReachable ? describe : describe.skip;

describePostgres('UserRepository', () => {
  let dataSource: DataSource;
  let repository: UserRepository;

  beforeAll(async () => {
    const admin = new DataSource({ type: 'postgres', ...connectionOptions() });
    await admin.initialize();
    await admin.query('DROP DATABASE IF EXISTS auth_test');
    await admin.query('CREATE DATABASE auth_test');
    await admin.destroy();

    // The migrations table lives in the DataSource `schema` (`auth`), so the
    // schema must exist *before* `runMigrations`, which on a brand-new database
    // it does not. The Init migration also declares `CREATE SCHEMA IF NOT EXISTS`
    // for the runtime path, but TypeORM opens its migration bookkeeping first.
    const bootstrap = new DataSource({
      type: 'postgres',
      ...connectionOptions(),
      database: 'auth_test',
    });
    await bootstrap.initialize();
    await bootstrap.query('CREATE SCHEMA IF NOT EXISTS "auth"');
    await bootstrap.destroy();

    dataSource = await buildTestDataSource({
      ...connectionOptions(),
      database: 'auth_test',
    }).initialize();
    await dataSource.runMigrations();
    repository = new UserRepository(dataSource.getRepository(User));
  }, 120_000);

  afterEach(async () => {
    // `user` is referenced by `user_role` and `external_link`, so a plain
    // `clear()` (TRUNCATE without CASCADE) is rejected. Cascade is safe here:
    // this suite only ever inserts `user` rows.
    await dataSource?.query('TRUNCATE TABLE "auth"."user" RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    const admin = new DataSource({ type: 'postgres', ...connectionOptions() });
    await admin.initialize();
    await admin.query('DROP DATABASE IF EXISTS auth_test');
    await admin.destroy();
  }, 120_000);

  it('should find an active user by email', async () => {
    await repository.save(
      repository.create({
        email: 'ivanov@example.by',
        passwordHash: 'x',
        firstName: 'Иван',
        lastName: 'Иванов',
        isActive: true,
      }),
    );

    expect((await repository.findByEmail('ivanov@example.by'))?.email).toBe('ivanov@example.by');
  });

  it('should exclude inactive users from the login lookup', async () => {
    await repository.save(
      repository.create({
        email: 'off@example.by',
        passwordHash: 'x',
        firstName: 'Пётр',
        lastName: 'Петров',
        isActive: false,
      }),
    );

    expect(await repository.findByEmailForLogin('off@example.by')).toBeNull();
  });
});
