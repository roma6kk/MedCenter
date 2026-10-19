import { AUDIT_PAGE_SIZE, defaultAuditFilter, hasAuditFilterErrors, toAuditParams, validateAuditFilter, type AuditFilter } from './audit-filter';

const valid: AuditFilter = { from: '2026-10-01', to: '2026-10-16', entity: '', userId: '' };

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
