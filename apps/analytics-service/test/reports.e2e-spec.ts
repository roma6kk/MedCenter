import request from 'supertest';

import { startAppHarness, type AppHarness } from './app-harness';

const YEAR_2026 = 'from=2026-01-01&to=2026-12-31';

describe('GET /api/v1/admin/analytics/* (API §9.1–9.3, FR-019)', () => {
  let harness: AppHarness;

  function get(path: string, token: string = harness.adminToken()): request.Test {
    return request(harness.app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);
  }

  beforeAll(async () => {
    harness = await startAppHarness();
  });

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(() => {
    harness.fhir.search.mockReset();
    harness.fhir.search.mockResolvedValue({ entry: [] });
  });

  it('should classify the HAPI no-shows through the read-model in the shape the dashboard reads when §9.1 is requested', async () => {
    harness.reports.countAppointmentsByStatus.mockResolvedValue([
      { status: 'booked', count: '10' },
      { status: 'cancelled', count: '3' },
      { status: 'noshow', count: '2' },
    ]);
    harness.fhir.search.mockResolvedValue({
      total: 2,
      entry: [
        { resource: { resourceType: 'Appointment', id: 'apt-7' } },
        { resource: { resourceType: 'Appointment', id: 'apt-9' } },
      ],
    });

    const response = await get(`/api/v1/admin/analytics/appointments?${YEAR_2026}`).expect(200);

    expect(response.body).toMatchObject({ booked: 10, cancelled: 3, noshow: 2, total: 15, scoring: 'cohort' });
    expect(harness.fhir.search).toHaveBeenCalledWith('Appointment', {
      status: 'noshow',
      date: ['ge2026-01-01T00:00:00.000Z', 'lt2027-01-01T00:00:00.000Z'],
      _elements: 'id',
      _sort: '_lastUpdated',
      _count: 200,
      _offset: 0,
    });
    expect(harness.reports.countAppointmentsByStatus).toHaveBeenLastCalledWith(expect.anything(), ['apt-7', 'apt-9']);
  });

  it('should group completed encounters by specialty when §9.2 is requested', async () => {
    harness.reports.countEncountersBySpecialty.mockResolvedValue([
      { system: 'http://snomed.info/sct', code: '394579002', display: 'Кардиология', count: '4' },
    ]);

    const response = await get(`/api/v1/admin/analytics/encounters?${YEAR_2026}`).expect(200);

    expect(response.body).toMatchObject({
      measure: 'encounters-by-specialty',
      total: 4,
      groups: [{ code: '394579002', system: 'http://snomed.info/sct', display: 'Кардиология', count: 4 }],
    });
  });

  it('should rank services with their HAPI names and honour top when §9.3 is requested', async () => {
    harness.reports.countBookingsByService.mockResolvedValue([{ serviceId: 'svc-1', count: '7' }]);
    harness.fhir.search.mockResolvedValue({ entry: [{ resource: { resourceType: 'HealthcareService', id: 'svc-1', name: 'Консультация терапевта' } }] });

    const response = await get(`/api/v1/admin/analytics/services-popularity?${YEAR_2026}&top=3`).expect(200);

    expect(harness.reports.countBookingsByService).toHaveBeenLastCalledWith(expect.anything(), 3);
    expect(response.body.groups).toEqual([{ code: 'svc-1', display: 'Консультация терапевта', count: 7 }]);
  });

  it.each([
    ['a period over 366 days', '/api/v1/admin/analytics/appointments?from=2024-01-01&to=2026-12-31'],
    ['an inverted period', '/api/v1/admin/analytics/encounters?from=2026-12-31&to=2026-01-01'],
    ['top above 50', `/api/v1/admin/analytics/services-popularity?${YEAR_2026}&top=51`],
    ['a non-ISO date', '/api/v1/admin/analytics/appointments?from=yesterday'],
    ['a month instead of a date', '/api/v1/admin/analytics/appointments?from=2026-10&to=2026-10'],
    ['a bare year instead of a date', '/api/v1/admin/analytics/encounters?from=2026&to=2026'],
    ['a date that does not exist', '/api/v1/admin/analytics/services-popularity?from=2026-02-30&to=2026-03-30'],
  ])('should reject the request with 400 VALIDATION_ERROR when the query carries %s', async (_case, path) => {
    const response = await get(path).expect(400);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body.errorCode).toBe('VALIDATION_ERROR');
  });

  describe.each([
    ['§9.1', '/api/v1/admin/analytics/appointments'],
    ['§9.2', '/api/v1/admin/analytics/encounters'],
    ['§9.3', '/api/v1/admin/analytics/services-popularity'],
  ])('access to %s (BR-007)', (_section, path) => {
    const url = `${path}?${YEAR_2026}`;

    it('should refuse a doctor with 403 FORBIDDEN_ROLE when reports are admin-only', async () => {
      const doctor = harness.issuer.sign({
        sub: 'doctor-user-3',
        role: 'DOCTOR',
        scope: 'user/*.read user/*.write launch',
        fhirUser: 'PractitionerRole/role-1',
      });

      const response = await get(url, doctor).expect(403);

      expect(response.body.errorCode).toBe('FORBIDDEN_ROLE');
    });

    it('should refuse a patient-scoped token with 403 FORBIDDEN_SCOPE when the report needs user scopes', async () => {
      const patient = harness.issuer.sign({
        sub: 'patient-user-1',
        role: 'PATIENT',
        scope: 'patient/*.read patient/*.write launch',
        patient: 'pat-1',
        fhirUser: 'Patient/pat-1',
      });

      const response = await get(url, patient).expect(403);

      expect(response.body.errorCode).toBe('FORBIDDEN_SCOPE');
    });

    it('should answer 401 UNAUTHENTICATED when no bearer token is sent', async () => {
      const response = await request(harness.app.getHttpServer()).get(url).expect(401);

      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body.errorCode).toBe('UNAUTHENTICATED');
    });
  });
});
