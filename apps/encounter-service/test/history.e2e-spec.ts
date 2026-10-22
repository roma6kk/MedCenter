import request from 'supertest';

import {
  ADMIN,
  APPOINTMENT_ID,
  bookedAppointment,
  completeBody,
  DOCTOR,
  healthcareService,
  OTHER_DOCTOR,
  PATIENT,
  startAppHarness,
  type AppHarness,
} from './app-harness';
import type { TestTokenClaims } from './test-tokens';

/** A finished encounter of another patient: it must never leak into `Patient/pat-1` listings. */
const FOREIGN_ENCOUNTER = {
  resourceType: 'Encounter',
  id: 'enc-foreign',
  status: 'finished',
  subject: { reference: 'Patient/pat-2' },
  participant: [{ individual: { reference: 'PractitionerRole/role-9' } }],
  period: { start: '2026-10-01T06:00:00Z', end: '2026-10-01T06:20:00Z' },
};

/**
 * API §7.4–7.7 over HTTP: the patient compartment comes from the token only
 * (ADR-013), a doctor reads a patient only after sharing care with them, an
 * admin reads no medical data (ADR-018). HAPI is the in-memory `FakeHapi`.
 */
describe('History and prescriptions (API §7.4–7.7)', () => {
  let harness: AppHarness;

  beforeEach(async () => {
    harness = await startAppHarness();
    harness.hapi.seed(bookedAppointment(), healthcareService(), FOREIGN_ENCOUNTER);
  });

  afterEach(async () => {
    await harness.close();
  });

  function get(claims: TestTokenClaims, path: string): request.Test {
    return request(harness.app.getHttpServer()).get(path).set('Authorization', `Bearer ${harness.issuer.sign(claims)}`);
  }

  function post(claims: TestTokenClaims, path: string, body: object): request.Test {
    return request(harness.app.getHttpServer()).post(path).set('Authorization', `Bearer ${harness.issuer.sign(claims)}`).send(body);
  }

  async function completeVisit(): Promise<string> {
    const opened = await post(DOCTOR, '/api/v1/encounters', { appointmentId: APPOINTMENT_ID }).expect(201);
    const encounterId = String(opened.body.id);
    await post(DOCTOR, `/api/v1/encounters/${encounterId}/complete`, completeBody()).expect(200);
    return encounterId;
  }

  it('should list only the token patient history when a patient query parameter names someone else', async () => {
    const encounterId = await completeVisit();

    const response = await get(PATIENT, '/api/v1/me/history?patient=Patient/pat-2').expect(200);

    expect(response.body.items).toEqual([expect.objectContaining({ id: encounterId, diagnosis: 'J06.9' })]);
    expect(response.body.meta).toEqual({ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });
  });

  it('should list the medication and the referral of the visit when the patient reads own prescriptions', async () => {
    const encounterId = await completeVisit();

    const response = await get(PATIENT, '/api/v1/me/prescriptions').expect(200);

    expect(response.body.items).toEqual([
      expect.objectContaining({ kind: 'medication', atcCode: 'J01FA10', dosageText: '1 таб 1 раз в день 3 дня', encounterId }),
      expect.objectContaining({ kind: 'service', code: '10008', note: 'Натощак', encounterId }),
    ]);
  });

  it('should answer 403 COMPARTMENT_VIOLATION when a patient reads another patient history', async () => {
    const response = await get(PATIENT, '/api/v1/patients/pat-2/history').expect(403);

    expect(response.body).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
  });

  it('should let the treating doctor read the patient history when they share an encounter', async () => {
    const encounterId = await completeVisit();

    const response = await get(DOCTOR, '/api/v1/patients/pat-1/history').expect(200);

    expect(response.body.items).toEqual([expect.objectContaining({ id: encounterId, practitionerRoleId: 'role-1' })]);
  });

  it('should answer 403 COMPARTMENT_VIOLATION when a doctor never treated the patient', async () => {
    const response = await get(OTHER_DOCTOR, '/api/v1/patients/pat-1/prescriptions').expect(403);

    expect(response.body).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
  });

  it('should answer 403 when an admin reads the history or the prescriptions of a patient', async () => {
    await completeVisit();

    // The role guard refuses first (FORBIDDEN_ROLE); the compartment check behind it is the second layer (ADR-018).
    for (const path of ['/api/v1/patients/pat-1/history', '/api/v1/patients/pat-1/prescriptions']) {
      const response = await get(ADMIN, path).expect(403);
      expect(response.body).toMatchObject({ errorCode: expect.stringMatching(/^(FORBIDDEN_ROLE|COMPARTMENT_VIOLATION)$/) });
      expect(JSON.stringify(response.body)).not.toContain('J06.9');
    }
  });

  it('should answer 403 FORBIDDEN_SCOPE when a doctor token calls the patient-only me routes', async () => {
    // ADR-009 guard order: the `user/*` token fails the `patient/*.read` check before the role check.
    const response = await get(DOCTOR, '/api/v1/me/history').expect(403);

    expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_SCOPE' });
  });

  it('should answer 400 VALIDATION_ERROR when the patient path id is made of dots only', async () => {
    const response = await get(DOCTOR, '/api/v1/patients/%2E%2E/history').expect(400);

    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });

  it('should answer 400 VALIDATION_ERROR when the page size exceeds the API limit', async () => {
    const response = await get(PATIENT, '/api/v1/me/history?pageSize=101').expect(400);

    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });
});
