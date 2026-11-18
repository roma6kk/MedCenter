import { adminAppointmentFilterFromParams, adminAppointmentFilterToQuery, adminAppointmentParams, defaultAdminAppointmentFilter } from './admin-appointment-filter';

const TODAY = '2026-11-16';

describe('defaultAdminAppointmentFilter', () => {
  it('should cover the next 30 clinic days with every status and every doctor', () => {
    expect(defaultAdminAppointmentFilter(TODAY)).toEqual({ from: '2026-11-16', to: '2026-12-15', doctorId: '', status: '' });
  });
});

describe('adminAppointmentParams', () => {
  it('should send the period, the doctor role, the status, the page and ascending order', () => {
    const filter = { from: '2026-11-02', to: '2026-11-09', doctorId: 'role-1', status: 'booked' } as const;

    expect(adminAppointmentParams(filter, 2)).toEqual({
      from: '2026-11-02',
      to: '2026-11-09',
      practitionerRoleId: 'role-1',
      status: 'booked',
      page: 2,
      pageSize: 20,
      sortOrder: 'asc',
    });
  });

  it('should leave the doctor and the status out when they are not chosen', () => {
    const params = adminAppointmentParams(defaultAdminAppointmentFilter(TODAY), 1);

    expect(params['practitionerRoleId']).toBeUndefined();
    expect(params['status']).toBeUndefined();
  });
});

describe('adminAppointmentFilterFromParams', () => {
  it('should fall back to the default when the address has no filter', () => {
    expect(adminAppointmentFilterFromParams(new URLSearchParams(''), TODAY)).toEqual(defaultAdminAppointmentFilter(TODAY));
  });

  it('should read a valid period, doctor and status from the address', () => {
    const params = new URLSearchParams('from=2026-11-02&to=2026-11-09&doctor=role-1&status=noshow');

    expect(adminAppointmentFilterFromParams(params, TODAY)).toEqual({ from: '2026-11-02', to: '2026-11-09', doctorId: 'role-1', status: 'noshow' });
  });

  it('should ignore a reversed period, a malformed doctor id and an unknown status', () => {
    const params = new URLSearchParams('from=2026-11-09&to=2026-11-02&doctor=a/b&status=done');

    expect(adminAppointmentFilterFromParams(params, TODAY)).toEqual(defaultAdminAppointmentFilter(TODAY));
  });
});

describe('adminAppointmentFilterToQuery', () => {
  it('should write nothing for the default filter', () => {
    expect(adminAppointmentFilterToQuery(defaultAdminAppointmentFilter(TODAY), TODAY)).toBe('');
  });

  it('should write only what differs from the default', () => {
    const filter = { from: '2026-11-02', to: '2026-11-09', doctorId: 'role-1', status: 'booked' } as const;

    expect(adminAppointmentFilterToQuery(filter, TODAY)).toBe('from=2026-11-02&to=2026-11-09&doctor=role-1&status=booked');
  });
});
