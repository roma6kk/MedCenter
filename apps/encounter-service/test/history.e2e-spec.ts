import type { FhirResource } from '@medcenter/fhir';
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
import type { TestTokenClaims } from '@medcenter/testing';

const FOREIGN_ENCOUNTER = {
  resourceType: 'Encounter',
  id: 'enc-foreign',
  status: 'finished',
  subject: { reference: 'Patient/pat-2' },
  participant: [{ individual: { reference: 'PractitionerRole/role-9' } }],
  period: { start: '2026-10-01T06:00:00Z', end: '2026-10-01T06:20:00Z' },
};

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

  it('should answer 400 when the encounterId filter is not a FHIR id', async () => {
    const response = await get(PATIENT, '/api/v1/me/prescriptions?encounterId=a%20b').expect(400);

    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });

  it('should answer 403 COMPARTMENT_VIOLATION when a doctor never treated the patient', async () => {
    const response = await get(OTHER_DOCTOR, '/api/v1/patients/pat-1/prescriptions').expect(403);

    expect(response.body).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
  });

  it('should answer 403 when an admin reads the history or the prescriptions of a patient', async () => {
    await completeVisit();

    for (const path of ['/api/v1/patients/pat-1/history', '/api/v1/patients/pat-1/prescriptions']) {
      const response = await get(ADMIN, path).expect(403);
      expect(response.body).toMatchObject({ errorCode: expect.stringMatching(/^(FORBIDDEN_ROLE|COMPARTMENT_VIOLATION)$/) });
      expect(JSON.stringify(response.body)).not.toContain('J06.9');
    }
  });

  describe('read audit (ADR-018, D-3)', () => {
    const readEvents = (): FhirResource[] => harness.hapi.stored('AuditEvent').filter((event) => ['R', 'E'].includes(String(event['action'])));

    it('should write an AuditEvent naming the doctor and the patient when the doctor reads the history', async () => {
      await completeVisit();

      await get(DOCTOR, '/api/v1/patients/pat-1/history').set('X-Request-Id', 'req-doc-1').expect(200);

      expect(readEvents()).toEqual([
        expect.objectContaining({
          outcome: '0',
          agent: [expect.objectContaining({ who: { identifier: { value: DOCTOR.sub } } })],
          entity: expect.arrayContaining([
            expect.objectContaining({ what: { reference: 'Patient/pat-1' } }),
            expect.objectContaining({ what: { identifier: { value: 'req-doc-1' } } }),
          ]),
        }),
      ]);
      expect(JSON.stringify(readEvents())).not.toContain('J06.9');
    });

    it('should write an AuditEvent with outcome 4 when a doctor who never treated the patient is refused', async () => {
      await get(OTHER_DOCTOR, '/api/v1/patients/pat-1/prescriptions').expect(403);

      expect(readEvents()).toEqual([expect.objectContaining({ outcome: '4', agent: [expect.objectContaining({ who: { identifier: { value: 'other-doctor' } } })] })]);
    });

    it('should not write an AuditEvent when a patient reads their own history', async () => {
      await get(PATIENT, '/api/v1/me/history').expect(200);

      expect(readEvents()).toEqual([]);
    });

    it('should still answer when the AuditEvent cannot be stored', async () => {
      jest.spyOn(harness.hapi, 'create').mockRejectedValue(new Error('HAPI down'));
      await completeVisit();

      await get(DOCTOR, '/api/v1/patients/pat-1/history').expect(200);
    });
  });

  it('should answer 403 FORBIDDEN_SCOPE when a doctor token calls the patient-only me routes', async () => {
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
