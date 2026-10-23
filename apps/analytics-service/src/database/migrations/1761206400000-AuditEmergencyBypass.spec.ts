import type { QueryRunner } from 'typeorm';

import { AuditEmergencyBypass1761206400000 } from './1761206400000-AuditEmergencyBypass';

async function statementsOf(direction: 'up' | 'down'): Promise<ReadonlyArray<string>> {
  const query = jest.fn().mockResolvedValue(undefined);
  await new AuditEmergencyBypass1761206400000()[direction]({ query } as unknown as QueryRunner);
  return query.mock.calls.map((call: ReadonlyArray<unknown>) => String(call[0]));
}

describe('AuditEmergencyBypass1761206400000', () => {
  it('should carry a stable migration name when TypeORM records it', () => {
    expect(new AuditEmergencyBypass1761206400000().name).toBe('AuditEmergencyBypass1761206400000');
  });

  it('should add the reason column and widen the action CHECK with emergency-bypass when up() runs', async () => {
    const queries = (await statementsOf('up')).join('\n');

    expect(queries).toContain('ADD COLUMN IF NOT EXISTS "reason" varchar(500)');
    expect(queries).toContain(`CHECK ("action" IN ('create', 'update', 'delete', 'read', 'denied', 'emergency-bypass'))`);
  });

  it('should drop the bypass rows and the column, then restore the previous CHECK when down() runs', async () => {
    const queries = await statementsOf('down');

    expect(queries[0]).toContain(`DELETE FROM "analytics"."audit_event" WHERE "action" = 'emergency-bypass'`);
    expect(queries.join('\n')).toContain('DROP COLUMN IF EXISTS "reason"');
    expect(queries[queries.length - 1]).toContain(`CHECK ("action" IN ('create', 'update', 'delete', 'read', 'denied'))`);
  });
});
