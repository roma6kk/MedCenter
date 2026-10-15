import type { QueryRunner } from 'typeorm';

import { RolesAndLinks1700000000001 } from './1700000000001-RolesAndLinks';

function makeQueryRunner(): { readonly query: jest.Mock } {
  return { query: jest.fn().mockResolvedValue(undefined) };
}

function statements(runner: { readonly query: jest.Mock }): ReadonlyArray<string> {
  return runner.query.mock.calls.map((call: ReadonlyArray<unknown>) => String(call[0]));
}

describe('RolesAndLinks1700000000001', () => {
  const migration = new RolesAndLinks1700000000001();

  it('should carry a stable migration name', () => {
    expect(migration.name).toBe('RolesAndLinks1700000000001');
  });

  it('should seed the three catalogue roles idempotently when up() runs', async () => {
    const runner = makeQueryRunner();

    await migration.up(runner as unknown as QueryRunner);

    const seed = statements(runner).find((query) => query.startsWith('INSERT INTO "auth"."role"'));
    expect(seed).toBeDefined();
    for (const role of ['PATIENT', 'DOCTOR', 'ADMIN']) {
      expect(seed).toContain(`'${role}'`);
    }
    expect(seed).toContain('ON CONFLICT ("name") DO NOTHING');
  });

  it('should make a FHIR resource linkable to a single user when up() runs', async () => {
    const runner = makeQueryRunner();

    await migration.up(runner as unknown as QueryRunner);

    expect(statements(runner)).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "uq_external_link_resource" ON "auth"."external_link" ("resource_type", "resource_id")',
    );
  });

  it('should make emails unique case-insensitively when up() runs', async () => {
    const runner = makeQueryRunner();

    await migration.up(runner as unknown as QueryRunner);

    expect(statements(runner).some((query) => query.includes('(lower("email"))'))).toBe(true);
  });

  it('should drop both indexes in reverse order when down() runs', async () => {
    const runner = makeQueryRunner();

    await migration.down(runner as unknown as QueryRunner);

    const queries = statements(runner);
    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain('"uq_user_email_lower"');
    expect(queries[1]).toContain('"uq_external_link_resource"');
  });

  it('should keep the seeded roles when down() runs because deleting them would cascade into user_role', async () => {
    const runner = makeQueryRunner();

    await migration.down(runner as unknown as QueryRunner);

    expect(statements(runner).some((query) => /DELETE|TRUNCATE/i.test(query))).toBe(false);
  });
});
