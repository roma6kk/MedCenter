import type { QueryRunner } from 'typeorm';

import { AuditAuthenticationActions1763078400000 } from './1763078400000-AuditAuthenticationActions';

async function statementsOf(direction: 'up' | 'down'): Promise<ReadonlyArray<string>> {
  const query = jest.fn().mockResolvedValue(undefined);
  await new AuditAuthenticationActions1763078400000()[direction]({ query } as unknown as QueryRunner);
  return query.mock.calls.map((call: ReadonlyArray<unknown>) => String(call[0]));
}

describe('AuditAuthenticationActions1763078400000', () => {
  it('should carry a stable migration name when TypeORM records it', () => {
    expect(new AuditAuthenticationActions1763078400000().name).toBe('AuditAuthenticationActions1763078400000');
  });

  it('should widen the action CHECK with the authentication actions when up() runs', async () => {
    const queries = (await statementsOf('up')).join('\n');

    expect(queries).toContain(`'emergency-bypass', 'login', 'login-failed', 'login-throttled', 'logout', 'session-idle'`);
  });

  it('should drop the authentication rows, then restore the previous CHECK when down() runs', async () => {
    const queries = await statementsOf('down');

    expect(queries[0]).toContain(`DELETE FROM "analytics"."audit_event" WHERE "action" IN ('login'`);
    expect(queries[queries.length - 1]).toContain(`CHECK ("action" IN ('create', 'update', 'delete', 'read', 'denied', 'emergency-bypass'))`);
  });
});
