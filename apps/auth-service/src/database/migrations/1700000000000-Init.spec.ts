import type { QueryRunner } from 'typeorm';

import { Init1700000000000 } from './1700000000000-Init';

const AUTH_TABLES: ReadonlyArray<string> = [
  'user',
  'role',
  'user_role',
  'external_link',
  'oauth_client',
  'oauth_token',
];

function makeQueryRunner(): { readonly query: jest.Mock } {
  return { query: jest.fn().mockResolvedValue(undefined) };
}

function statements(runner: { readonly query: jest.Mock }): ReadonlyArray<string> {
  return runner.query.mock.calls.map((call: ReadonlyArray<unknown>) => String(call[0]));
}

describe('Init1700000000000', () => {
  const migration = new Init1700000000000();

  it('should carry a stable migration name', () => {
    expect(migration.name).toBe('Init1700000000000');
  });

  it('should create the auth schema before any table in up()', async () => {
    const runner = makeQueryRunner();

    await migration.up(runner as unknown as QueryRunner);

    expect(statements(runner)[0]).toBe('CREATE SCHEMA IF NOT EXISTS "auth"');
  });

  it('should create exactly the six auth tables in up()', async () => {
    const runner = makeQueryRunner();

    await migration.up(runner as unknown as QueryRunner);

    const creates = statements(runner).filter((query) => query.startsWith('CREATE TABLE'));
    expect(creates).toHaveLength(6);
    for (const table of AUTH_TABLES) {
      expect(creates.some((query) => query.includes(`"auth"."${table}"`))).toBe(true);
    }
  });

  it('should make every up() statement idempotent and schema-qualified', async () => {
    const runner = makeQueryRunner();

    await migration.up(runner as unknown as QueryRunner);

    const queries = statements(runner);
    expect(queries[0]).toContain('IF NOT EXISTS');
    expect(queries.slice(1).every((query) => query.includes('"auth"'))).toBe(true);
    expect(queries.slice(1).every((query) => query.includes('"auth"."'))).toBe(true);
  });

  it('should issue one statement per schema object in up()', async () => {
    const runner = makeQueryRunner();

    await migration.up(runner as unknown as QueryRunner);

    expect(runner.query).toHaveBeenCalledTimes(7);
  });

  it('should drop every auth table before the schema in down()', async () => {
    const runner = makeQueryRunner();

    await migration.down(runner as unknown as QueryRunner);

    const queries = statements(runner);
    const schemaDropIndex = queries.findIndex((query) => query.includes('DROP SCHEMA'));
    expect(queries).toHaveLength(7);
    expect(schemaDropIndex).toBe(queries.length - 1);
    for (const table of AUTH_TABLES) {
      const index = queries.findIndex((query) => query.includes(`"auth"."${table}"`));
      expect(index).toBeGreaterThan(-1);
      expect(index).toBeLessThan(schemaDropIndex);
    }
  });

  it('should drop the user table after its referencing tables in down()', async () => {
    const runner = makeQueryRunner();

    await migration.down(runner as unknown as QueryRunner);

    const queries = statements(runner);
    const userIndex = queries.findIndex((query) => query.includes('DROP TABLE IF EXISTS "auth"."user"'));
    const userRoleIndex = queries.findIndex((query) =>
      query.includes('DROP TABLE IF EXISTS "auth"."user_role"'),
    );

    expect(userRoleIndex).toBeGreaterThan(-1);
    expect(userIndex).toBeGreaterThan(userRoleIndex);
  });
});
