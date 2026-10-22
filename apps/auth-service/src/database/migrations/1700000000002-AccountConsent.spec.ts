import type { QueryRunner } from 'typeorm';

import { AccountConsent1700000000002 } from './1700000000002-AccountConsent';

function makeQueryRunner(): { readonly query: jest.Mock } {
  return { query: jest.fn().mockResolvedValue(undefined) };
}

function statements(runner: { readonly query: jest.Mock }): ReadonlyArray<string> {
  return runner.query.mock.calls.map((call: ReadonlyArray<unknown>) => String(call[0]));
}

describe('AccountConsent1700000000002', () => {
  const migration = new AccountConsent1700000000002();

  it('should carry a stable migration name', () => {
    expect(migration.name).toBe('AccountConsent1700000000002');
  });

  it('should add both nullable columns idempotently when up() runs', async () => {
    const runner = makeQueryRunner();

    await migration.up(runner as unknown as QueryRunner);

    const sql = statements(runner).join('\n');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "account_consent_at" TIMESTAMPTZ NULL');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "account_consent_version" VARCHAR(64) NULL');
  });

  it('should drop both columns when down() runs', async () => {
    const runner = makeQueryRunner();

    await migration.down(runner as unknown as QueryRunner);

    const sql = statements(runner).join('\n');
    expect(sql).toContain('DROP COLUMN IF EXISTS "account_consent_at"');
    expect(sql).toContain('DROP COLUMN IF EXISTS "account_consent_version"');
  });
});
