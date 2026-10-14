import request from 'supertest';

import { bookedSearchBundle, startAppHarness, type AppHarness } from './app-harness';
import type { TestTokenClaims } from './test-tokens';

const PATIENT: TestTokenClaims = { sub: 'user-1', role: 'PATIENT', scope: 'patient/*.read patient/*.write launch', patient: 'pat-1' };
const DOCTOR: TestTokenClaims = { sub: 'doc-1', role: 'DOCTOR', scope: 'user/*.read user/*.write launch', fhirUser: 'PractitionerRole/role-1' };

/**
 * Appointment reads over HTTP (API §6.2, §6.3, §6.5): the real guard stack,
 * validation pipe and RFC 7807 filter in front of a fake HAPI.
 */
describe('Appointment reads (e2e)', () => {
  let harness: AppHarness;
  const bearer = (claims: TestTokenClaims): string => `Bearer ${harness.issuer.sign(claims)}`;

  beforeAll(async () => {
    harness = await startAppHarness();
  });

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(() => {
    harness.fhir.search.mockReset();
    harness.fhir.search.mockResolvedValue(bookedSearchBundle());
  });

  it.each(['/api/v1/appointments', '/api/v1/appointments/apt-1', '/api/v1/doctor/appointments'])(
    'should answer 401 UNAUTHENTICATED when %s is called without a token',
    async (path) => {
      const response = await request(harness.app.getHttpServer()).get(path).expect(401);

      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
      expect(harness.fhir.search).not.toHaveBeenCalled();
    },
  );

  it('should list the own appointments with names and ignore a patient query parameter when a patient asks', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/appointments?upcoming=true&page=1&pageSize=10&patient=Patient/someone-else')
      .set('Authorization', bearer(PATIENT))
      .expect(200);

    expect(harness.fhir.search).toHaveBeenCalledWith('Appointment', expect.objectContaining({ patient: 'Patient/pat-1', _count: 10 }));
    expect(response.body.meta).toEqual({ page: 1, pageSize: 10, totalItems: 1, totalPages: 1 });
    expect(response.body.items[0]).toMatchObject({
      id: 'apt-1',
      status: 'booked',
      doctorId: 'doc-7',
      doctorName: 'Петров Иван',
      serviceName: 'Консультация терапевта',
    });
  });

  it('should answer 400 VALIDATION_ERROR without searching when pageSize exceeds 100', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/appointments?pageSize=500')
      .set('Authorization', bearer(PATIENT))
      .expect(400);

    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    expect(harness.fhir.search).not.toHaveBeenCalled();
  });

  it('should return the appointment to its participant doctor when the doctor reads one', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/appointments/apt-1')
      .set('Authorization', bearer(DOCTOR))
      .expect(200);

    expect(response.body).toMatchObject({ id: 'apt-1', patientId: 'pat-1', patientName: 'Иванова Анна' });
  });

  it('should answer 403 COMPARTMENT_VIOLATION when another patient reads the appointment', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/appointments/apt-1')
      .set('Authorization', bearer({ ...PATIENT, sub: 'user-2', patient: 'pat-2' }))
      .expect(403);

    expect(response.body).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
  });

  it('should answer 404 NOT_FOUND when the appointment does not exist', async () => {
    harness.fhir.search.mockResolvedValue({ total: 0, entry: [] });

    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/appointments/missing')
      .set('Authorization', bearer(PATIENT))
      .expect(404);

    expect(response.body).toMatchObject({ errorCode: 'NOT_FOUND' });
  });

  it('should answer 400 VALIDATION_ERROR when the id is not a FHIR id', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/appointments/apt-1,apt-2')
      .set('Authorization', bearer(PATIENT))
      .expect(400);

    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    expect(harness.fhir.search).not.toHaveBeenCalled();
  });

  it('should answer 403 FORBIDDEN_SCOPE when a patient token lacks patient/*.read', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/appointments/apt-1')
      .set('Authorization', bearer({ ...PATIENT, scope: 'patient/*.write' }))
      .expect(403);

    expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_SCOPE' });
  });

  it("should list the doctor's appointments by PractitionerRole and date range when a doctor asks", async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/doctor/appointments?from=2026-11-02&to=2026-11-02&page=1')
      .set('Authorization', bearer(DOCTOR))
      .expect(200);

    expect(harness.fhir.search).toHaveBeenCalledWith(
      'Appointment',
      expect.objectContaining({ actor: 'PractitionerRole/role-1', date: ['ge2026-11-02', 'le2026-11-02'] }),
    );
    expect(response.body.items[0]).toMatchObject({ id: 'apt-1', patientName: 'Иванова Анна' });
  });

  it('should fail closed with 403 COMPARTMENT_VIOLATION when the doctor token has no fhirUser', async () => {
    const withoutIdentity: TestTokenClaims = { sub: DOCTOR.sub, role: DOCTOR.role, scope: DOCTOR.scope };

    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/doctor/appointments')
      .set('Authorization', bearer(withoutIdentity))
      .expect(403);

    expect(response.body).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
    expect(harness.fhir.search).not.toHaveBeenCalled();
  });

  it('should answer 403 FORBIDDEN_ROLE when a patient calls the doctor listing', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/doctor/appointments')
      .set('Authorization', bearer({ ...PATIENT, scope: 'patient/*.read user/*.read' }))
      .expect(403);

    expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_ROLE' });
  });

  it('should answer 400 VALIDATION_ERROR when from is not an ISO 8601 date', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/doctor/appointments?from=yesterday')
      .set('Authorization', bearer(DOCTOR))
      .expect(400);

    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });
});
