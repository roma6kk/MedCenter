import type { QueryRunner } from 'typeorm';

import { AccountRetention1700000000004 } from './1700000000004-AccountRetention';

function sqlOf(run: (runner: QueryRunner) => Promise<void>): Promise<string> {
  const query = jest.fn().mockResolvedValue(undefined);
  return run({ query } as unknown as QueryRunner).then(() =>
    query.mock.calls.map((call: ReadonlyArray<unknown>) => String(call[0])).join('\n'),
  );
}

describe('AccountRetention1700000000004', () => {
  const migration = new AccountRetention1700000000004();

  it('should carry a stable migration name', () => {
    expect(migration.name).toBe('AccountRetention1700000000004');
  });

  it('should add both nullable columns idempotently when up() runs', async () => {
    const sql = await sqlOf((runner) => migration.up(runner));

    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMPTZ NULL');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "retention_until" TIMESTAMPTZ NULL');
  });

  it('should backfill accounts that were already closed when up() runs', async () => {
    expect(await sqlOf((runner) => migration.up(runner))).toContain('"is_active" = false AND "closed_at" IS NULL');
  });

  it('should drop the columns when down() runs', async () => {
    const sql = await sqlOf((runner) => migration.down(runner));

    expect(sql).toContain('DROP COLUMN IF EXISTS "retention_until"');
    expect(sql).toContain('DROP COLUMN IF EXISTS "closed_at"');
  });
});
