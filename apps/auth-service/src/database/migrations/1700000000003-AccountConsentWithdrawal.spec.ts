import type { QueryRunner } from 'typeorm';

import { AccountConsentWithdrawal1700000000003 } from './1700000000003-AccountConsentWithdrawal';

function sqlOf(run: (runner: QueryRunner) => Promise<void>): Promise<string> {
  const query = jest.fn().mockResolvedValue(undefined);
  return run({ query } as unknown as QueryRunner).then(() =>
    query.mock.calls.map((call: ReadonlyArray<unknown>) => String(call[0])).join('\n'),
  );
}

describe('AccountConsentWithdrawal1700000000003', () => {
  const migration = new AccountConsentWithdrawal1700000000003();

  it('should carry a stable migration name', () => {
    expect(migration.name).toBe('AccountConsentWithdrawal1700000000003');
  });

  it('should add the nullable column idempotently when up() runs', async () => {
    expect(await sqlOf((runner) => migration.up(runner))).toContain(
      'ADD COLUMN IF NOT EXISTS "account_consent_withdrawn_at" TIMESTAMPTZ NULL',
    );
  });

  it('should drop the column when down() runs', async () => {
    expect(await sqlOf((runner) => migration.down(runner))).toContain('DROP COLUMN IF EXISTS "account_consent_withdrawn_at"');
  });
});
