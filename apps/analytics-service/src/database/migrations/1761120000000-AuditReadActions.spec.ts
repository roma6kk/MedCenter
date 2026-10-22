import type { QueryRunner } from 'typeorm';

import { AuditReadActions1761120000000 } from './1761120000000-AuditReadActions';

async function statementsOf(direction: 'up' | 'down'): Promise<ReadonlyArray<string>> {
  const query = jest.fn().mockResolvedValue(undefined);
  await new AuditReadActions1761120000000()[direction]({ query } as unknown as QueryRunner);
  return query.mock.calls.map((call: ReadonlyArray<unknown>) => String(call[0]));
}

describe('AuditReadActions1761120000000', () => {
  it('should carry a stable migration name when TypeORM records it', () => {
    expect(new AuditReadActions1761120000000().name).toBe('AuditReadActions1761120000000');
  });

  it('should widen the action CHECK with read and denied when up() runs', async () => {
    const queries = await statementsOf('up');

    expect(queries[0]).toContain('DROP CONSTRAINT IF EXISTS "audit_event_action_check"');
    expect(queries[1]).toContain(`CHECK ("action" IN ('create', 'update', 'delete', 'read', 'denied'))`);
  });

  it('should drop the read rows before it narrows the CHECK when down() runs', async () => {
    const queries = await statementsOf('down');

    expect(queries[0]).toContain(`DELETE FROM "analytics"."audit_event" WHERE "action" IN ('read', 'denied')`);
    expect(queries[2]).toContain(`CHECK ("action" IN ('create', 'update', 'delete'))`);
  });
});
