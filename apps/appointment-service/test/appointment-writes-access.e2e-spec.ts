import request from 'supertest';

import { BOOKED_APPOINTMENT, startAppHarness, type AppHarness } from './app-harness';
import type { TestTokenClaims } from './test-tokens';

const DOCTOR: TestTokenClaims = { sub: 'doc-1', role: 'DOCTOR', scope: 'user/*.read user/*.write launch', fhirUser: 'PractitionerRole/role-1' };
const ADMIN: TestTokenClaims = { sub: 'adm-1', role: 'ADMIN', scope: 'user/*.read user/*.write launch' };
const PATIENT: TestTokenClaims = { sub: 'user-1', role: 'PATIENT', scope: 'patient/*.read patient/*.write launch', patient: 'pat-1' };

const COMMITTED = { resourceType: 'Bundle', type: 'transaction-response', entry: [] };

/** Slot id shape catalog-service generates: 64 hex chars of SHA-256, not a UUID. */
const GENERATED_SLOT_ID = 'a3f1c9e07b2d4c5e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e';
const FREE_SLOT = {
  resourceType: 'Slot',
  id: GENERATED_SLOT_ID,
  status: 'free',
  start: '2026-11-02T09:00:00+03:00',
  end: '2026-11-02T09:30:00+03:00',
  schedule: { reference: 'Schedule/sched-1' },
  meta: { versionId: '1' },
};
const SCHEDULE = {
  resourceType: 'Schedule',
  id: 'sched-1',
  actor: [{ reference: 'PractitionerRole/role-1' }, { reference: 'HealthcareService/svc-1' }],
};

/**
 * Access rules of the M3 write side over HTTP (API §6.4, §6.6): the doctor is
 * recognised by the `fhirUser = PractitionerRole/{id}` claim auth-service now
 * issues, and the cancel scope follows the caller's role.
 */
describe('Appointment write access (e2e)', () => {
  let harness: AppHarness;
  const bearer = (claims: TestTokenClaims): string => `Bearer ${harness.issuer.sign(claims)}`;

  beforeAll(async () => {
    harness = await startAppHarness();
  });

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(() => {
    harness.fhir.read.mockReset();
    harness.fhir.batch.mockReset();
    harness.fhir.read.mockImplementation(async (type) =>
      type === 'Appointment' ? BOOKED_APPOINTMENT : { resourceType: 'Slot', id: 'slot-1', status: 'busy', meta: { versionId: '3' } },
    );
    harness.fhir.batch.mockResolvedValue(COMMITTED);
  });

  it('should book with 201 when the slot id is the hex digest catalog-service generates', async () => {
    harness.fhir.read.mockImplementation(async (type) => (type === 'Slot' ? FREE_SLOT : SCHEDULE));
    harness.fhir.batch.mockResolvedValue({
      ...COMMITTED,
      entry: [{}, { response: { status: '201', location: 'Appointment/apt-9/_history/1' } }, {}],
    });

    const response = await request(harness.app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', bearer(PATIENT))
      .send({ slotId: GENERATED_SLOT_ID })
      .expect(201);

    expect(response.body).toMatchObject({ id: 'apt-9', status: 'booked', slotId: GENERATED_SLOT_ID, patientId: 'pat-1' });
  });

  it('should answer 400 VALIDATION_ERROR without reading FHIR when slotId is not a FHIR id', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', bearer(PATIENT))
      .send({ slotId: 'Slot/../Patient' })
      .expect(400);

    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
    expect(harness.fhir.read).not.toHaveBeenCalled();
  });

  it('should mark a no-show when the participant doctor calls it', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/v1/doctor/appointments/apt-1/noshow')
      .set('Authorization', bearer(DOCTOR))
      .expect(200);

    expect(response.body).toMatchObject({ id: 'apt-1', status: 'noshow' });
    expect(harness.fhir.batch).toHaveBeenCalledTimes(1);
  });

  it('should record the X-Request-Id and the patient in the AuditEvent when a doctor marks a no-show', async () => {
    await request(harness.app.getHttpServer())
      .post('/api/v1/doctor/appointments/apt-1/noshow')
      .set('Authorization', bearer(DOCTOR))
      .set('X-Request-Id', 'req-e2e-1')
      .expect(200);

    const bundle = harness.fhir.batch.mock.calls[0]?.[0] as unknown as { entry: Array<{ resource: { resourceType: string; entity?: unknown[] } }> };
    const audit = bundle.entry.map((entry) => entry.resource).find((resource) => resource.resourceType === 'AuditEvent');
    expect(audit?.entity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ what: { identifier: { value: 'req-e2e-1' } } }),
        expect.objectContaining({ what: { reference: 'Patient/pat-1' } }),
      ]),
    );
  });

  it('should answer 403 COMPARTMENT_VIOLATION without writing when another doctor calls no-show', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/v1/doctor/appointments/apt-1/noshow')
      .set('Authorization', bearer({ ...DOCTOR, sub: 'doc-9', fhirUser: 'PractitionerRole/role-9' }))
      .expect(403);

    expect(response.body).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
    expect(harness.fhir.batch).not.toHaveBeenCalled();
  });

  it('should let the owner patient cancel when the token carries a bare Patient id', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/v1/appointments/apt-1/cancel')
      .set('Authorization', bearer(PATIENT))
      .send({ reason: 'не смогу прийти' })
      .expect(200);

    expect(response.body).toMatchObject({ status: 'cancelled', cancelReason: 'не смогу прийти' });
  });

  it('should answer 403 FORBIDDEN_SCOPE without reading when an admin without user/*.write cancels', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/v1/appointments/apt-1/cancel')
      .set('Authorization', bearer({ ...ADMIN, scope: 'user/*.read' }))
      .send({ reason: 'ошибка записи' })
      .expect(403);

    expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_SCOPE' });
    expect(harness.fhir.read).not.toHaveBeenCalled();
  });
});
