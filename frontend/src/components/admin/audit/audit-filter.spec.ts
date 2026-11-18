import { AUDIT_ACTION_GROUPS, AUDIT_PAGE_SIZE, auditFilterFromParams, auditFilterToQuery, defaultAuditFilter, GROUP_ACTIONS, hasAuditFilterErrors, toAuditParams, validateAuditFilter, type AuditFilter } from './audit-filter';
import type { AuditAction } from './audit-types';

const valid: AuditFilter = { from: '2026-10-01', to: '2026-10-16', entity: '', userId: '', group: 'all' };

describe('validateAuditFilter', () => {
  it('should accept the default last-30-days filter when nothing is typed', () => {
    expect(hasAuditFilterErrors(validateAuditFilter(defaultAuditFilter('2026-10-16')))).toBe(false);
  });

  it.each(['Appointment', 'Appointment/123', 'AuthUser', 'Slot/abc-1.2'])('should accept the entity %s when the filter is checked', (entity) => {
    expect(validateAuditFilter({ ...valid, entity }).entity).toBeUndefined();
  });

  it.each(['appointment', 'Appointment/', 'A', 'Appointment/a b', 'Patient/x/y'])('should refuse the entity %s when the filter is checked', (entity) => {
    expect(validateAuditFilter({ ...valid, entity }).entity).toBe(true);
  });

  it('should refuse a user id when it has unsupported characters', () => {
    expect(validateAuditFilter({ ...valid, userId: 'a b' }).userId).toBe(true);
    expect(validateAuditFilter({ ...valid, userId: 'PractitionerRole/6ef5270b' }).userId).toBeUndefined();
  });

  it('should report the period reason when the span is over 366 days', () => {
    expect(validateAuditFilter({ ...valid, from: '2025-01-01', to: '2026-10-16' }).range).toBe('span');
  });

  it('should not complain when the optional filters are blank', () => {
    expect(validateAuditFilter({ ...valid, entity: '  ', userId: '  ' })).toEqual({});
  });
});

describe('toAuditParams', () => {
  it('should send the period and the page size and trim the text filters when the query is built', () => {
    expect(toAuditParams({ ...valid, entity: ' Appointment ', userId: '' }, 2)).toEqual({
      from: '2026-10-01',
      to: '2026-10-16',
      entity: 'Appointment',
      userId: '',
      page: 2,
      pageSize: AUDIT_PAGE_SIZE,
    });
  });
});

describe('action groups', () => {
  it('should cover every audit action exactly once', () => {
    const all: ReadonlyArray<AuditAction> = ['create', 'update', 'delete', 'read', 'denied', 'emergency-bypass', 'login', 'login-failed', 'login-throttled', 'logout', 'session-idle'];
    const grouped = AUDIT_ACTION_GROUPS.filter((group) => group !== 'all').flatMap((group) => GROUP_ACTIONS[group as Exclude<typeof group, 'all'>]);

    expect([...grouped].sort()).toEqual([...all].sort());
  });

  it('should send no action when every event type is chosen', () => {
    expect(toAuditParams(valid, 1)['action']).toBeUndefined();
  });

  it.each([
    ['auth', 'login,login-failed,login-throttled,logout,session-idle'],
    ['read', 'read,denied'],
    ['changes', 'create,update,delete'],
    ['emergency', 'emergency-bypass'],
  ] as const)('should send the actions of the %s group as a comma list', (group, expected) => {
    expect(toAuditParams({ ...valid, group }, 1)['action']).toBe(expected);
  });
});

describe('address of the filter', () => {
  const today = '2026-10-16';

  it('should leave the address bare when the filter is the default one', () => {
    expect(auditFilterToQuery(defaultAuditFilter(today), today)).toBe('');
  });

  it('should write the group, period and text filters that differ from the default', () => {
    const filter: AuditFilter = { from: '2026-10-01', to: '2026-10-10', entity: 'Patient', userId: 'u-1', group: 'auth' };

    expect(auditFilterToQuery(filter, today)).toBe('type=auth&from=2026-10-01&to=2026-10-10&entity=Patient&userId=u-1');
  });

  it('should read back what it wrote', () => {
    const filter: AuditFilter = { from: '2026-10-01', to: '2026-10-10', entity: 'Patient', userId: 'u-1', group: 'emergency' };

    expect(auditFilterFromParams(new URLSearchParams(auditFilterToQuery(filter, today)), today)).toEqual(filter);
  });

  it('should fall back to the default for an unknown group or a malformed value in the address', () => {
    const params = new URLSearchParams('type=teleport&from=31.10.2026&to=2026-10-10&entity=bad entity&userId=a b');

    expect(auditFilterFromParams(params, today)).toEqual(defaultAuditFilter(today));
  });
});
