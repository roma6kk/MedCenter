import request from 'supertest';

import { bookedSearchBundle, startAppHarness, type AppHarness } from './app-harness';
import type { TestTokenClaims } from '@medcenter/testing';

const ADMIN: TestTokenClaims = { sub: 'adm-1', role: 'ADMIN', scope: 'user/*.read user/*.write launch' };
const DOCTOR: TestTokenClaims = { sub: 'doc-1', role: 'DOCTOR', scope: 'user/*.read user/*.write launch', fhirUser: 'PractitionerRole/role-1' };
const PATIENT: TestTokenClaims = { sub: 'user-1', role: 'PATIENT', scope: 'patient/*.read patient/*.write launch', patient: 'pat-1' };

describe('Admin appointments list (e2e)', () => {
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
    harness.fhir.create.mockReset();
    harness.fhir.create.mockResolvedValue({ resourceType: 'AuditEvent' });
  });

  it('should answer 401 UNAUTHENTICATED without a token', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/v1/admin/appointments').expect(401);

    expect(response.body).toMatchObject({ errorCode: 'UNAUTHENTICATED' });
    expect(harness.fhir.search).not.toHaveBeenCalled();
  });

  it.each([['DOCTOR', DOCTOR], ['PATIENT', PATIENT]] as const)('should answer 403 for a %s without searching', async (_role, claims) => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/admin/appointments')
      .set('Authorization', bearer(claims))
      .expect(403);

    expect(['FORBIDDEN_ROLE', 'FORBIDDEN_SCOPE']).toContain(response.body.errorCode);
    expect(harness.fhir.search).not.toHaveBeenCalled();
  });

  it('should list the appointments of all patients for an admin, filtered, with names and no visit reason, and write a read AuditEvent', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/v1/admin/appointments?from=2026-11-02&to=2026-11-02&practitionerRoleId=role-1&status=booked')
      .set('Authorization', bearer(ADMIN))
      .expect(200);

    expect(harness.fhir.search).toHaveBeenCalledWith('Appointment', expect.objectContaining({
      actor: 'PractitionerRole/role-1',
      status: 'booked',
      date: ['ge2026-11-01T21:00:00.000Z', 'le2026-11-02T20:59:59.999Z'],
    }));
    expect(response.body.items[0]).toMatchObject({ id: 'apt-1', patientName: 'Иванова Анна', doctorName: 'Петров Иван', serviceName: 'Консультация терапевта' });
    expect(Object.keys(response.body.items[0])).not.toContain('reason');
    expect(harness.fhir.create).toHaveBeenCalledWith('AuditEvent', expect.objectContaining({
      action: 'E',
      entity: expect.arrayContaining([expect.objectContaining({ what: { reference: 'Patient/pat-1' } })]),
    }));
  });

  it('should answer 400 VALIDATION_ERROR without searching when practitionerRoleId is not a FHIR id', async () => {
    await request(harness.app.getHttpServer())
      .get('/api/v1/admin/appointments?practitionerRoleId=a/b')
      .set('Authorization', bearer(ADMIN))
      .expect(400);

    expect(harness.fhir.search).not.toHaveBeenCalled();
  });
});
