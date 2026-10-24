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

const CLINICAL_TYPES = ['Condition', 'ClinicalImpression', 'CarePlan', 'Observation', 'ServiceRequest', 'MedicationRequest'];

/**
 * API §7.1–7.3 over HTTP (plan Task 14, Step 5): open → complete with
 * `J06.9` / `36.6 Cel` / `J01FA10` → replay. HAPI is the in-memory `FakeHapi`
 * (atomic transactions with `If-Match`); the live-stack variant runs against
 * the compose HAPI.
 */
describe('Complete encounter (API §7.1–7.3)', () => {
  let harness: AppHarness;

  beforeEach(async () => {
    harness = await startAppHarness();
    harness.hapi.seed(bookedAppointment(), healthcareService());
  });

  afterEach(async () => {
    await harness.close();
  });

  function as(claims: typeof DOCTOR): { post: (path: string, body: object) => request.Test; get: (path: string) => request.Test } {
    const bearer = `Bearer ${harness.issuer.sign(claims)}`;
    return {
      post: (path, body) => request(harness.app.getHttpServer()).post(path).set('Authorization', bearer).send(body),
      get: (path) => request(harness.app.getHttpServer()).get(path).set('Authorization', bearer),
    };
  }

  async function openEncounter(): Promise<string> {
    const response = await as(DOCTOR).post('/api/v1/encounters', { appointmentId: APPOINTMENT_ID }).expect(201);
    return String(response.body.id);
  }

  it('should open and complete the encounter atomically and record encounter.completed in the outbox when the doctor follows the clinical chain', async () => {
    const encounterId = await openEncounter();

    const response = await as(DOCTOR).post(`/api/v1/encounters/${encounterId}/complete`, completeBody()).expect(200);

    expect(response.body).toMatchObject({ id: encounterId, status: 'finished', diagnosisCodes: ['J06.9'], appointmentId: APPOINTMENT_ID });
    expect(response.body.period.end).toEqual(expect.any(String));
    const completion = harness.hapi.transactions[1]?.['entry'] as Array<{ resource: { resourceType: string } }>;
    expect(new Set(completion.map((entry) => entry.resource.resourceType))).toEqual(new Set(['Encounter', 'Appointment', 'AuditEvent', 'Basic', ...CLINICAL_TYPES]));
    for (const type of CLINICAL_TYPES) {
      expect(harness.hapi.stored(type)).toHaveLength(1);
    }
    const [outbox] = harness.hapi.stored('Basic');
    expect(harness.hapi.stored('Basic')).toHaveLength(1);
    const extensions = outbox?.['extension'] as Array<{ url: string; valueString?: string }>;
    const event = JSON.parse(extensions.find((extension) => extension.url.endsWith('outbox-payload'))?.valueString ?? '{}');
    expect(event).toMatchObject({ type: 'encounter.completed.v1', encounterId, patientRef: 'Patient/pat-1', diagnosisCount: 1 });
    expect(JSON.stringify(outbox)).not.toContain('J06.9');
  });

  it('should set the appointment to fulfilled in the completion transaction when the encounter is finished', async () => {
    const encounterId = await openEncounter();
    expect(harness.hapi.stored('Appointment')[0]).toMatchObject({ id: APPOINTMENT_ID, status: 'booked' });

    await as(DOCTOR).post(`/api/v1/encounters/${encounterId}/complete`, completeBody()).expect(200);

    expect(harness.hapi.stored('Appointment')[0]).toMatchObject({ id: APPOINTMENT_ID, status: 'fulfilled' });
    expect(harness.hapi.stored('Encounter')[0]).toMatchObject({ status: 'finished' });
  });

  it('should write nothing and keep the encounter in progress when the appointment changed after the completion read it', async () => {
    const encounterId = await openEncounter();
    harness.hapi.holdTransactions();

    const completing = Promise.resolve(as(DOCTOR).post(`/api/v1/encounters/${encounterId}/complete`, completeBody()));
    await harness.hapi.waitForHeldTransactions(1);
    harness.hapi.seed({ ...bookedAppointment(), status: 'noshow' });
    harness.hapi.releaseTransactions();
    const response = await completing;

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ errorCode: 'ENCOUNTER_STATE_INVALID' });
    expect(harness.hapi.stored('Encounter')[0]).toMatchObject({ status: 'in-progress' });
    expect(harness.hapi.stored('Appointment')[0]).toMatchObject({ status: 'noshow' });
    expect(harness.hapi.stored('Condition')).toHaveLength(0);
  });

  it('should link the stored prescriptions to the encounter and the stored diagnosis when the transaction commits', async () => {
    const encounterId = await openEncounter();
    await as(DOCTOR).post(`/api/v1/encounters/${encounterId}/complete`, completeBody()).expect(200);

    const conditionRef = `Condition/${harness.hapi.stored('Condition')[0]?.id ?? '?'}`;
    for (const type of ['MedicationRequest', 'ServiceRequest']) {
      expect(harness.hapi.stored(type)[0]).toMatchObject({
        encounter: { reference: `Encounter/${encounterId}` },
        reasonReference: [{ reference: conditionRef }],
      });
    }
  });

  it('should answer 409 ENCOUNTER_STATE_INVALID and write nothing when the completion is replayed', async () => {
    const encounterId = await openEncounter();
    await as(DOCTOR).post(`/api/v1/encounters/${encounterId}/complete`, completeBody()).expect(200);

    const replay = await as(DOCTOR).post(`/api/v1/encounters/${encounterId}/complete`, completeBody()).expect(409);

    expect(replay.headers['content-type']).toContain('application/problem+json');
    expect(replay.body).toMatchObject({ status: 409, errorCode: 'ENCOUNTER_STATE_INVALID' });
    expect(harness.hapi.transactions).toHaveLength(2);
    expect(harness.hapi.stored('Basic')).toHaveLength(1);
  });

  it('should let exactly one of two concurrent completions win when both read the same version', async () => {
    const encounterId = await openEncounter();
    harness.hapi.holdTransactions();

    const racing = Promise.all([
      as(DOCTOR).post(`/api/v1/encounters/${encounterId}/complete`, completeBody()),
      as(DOCTOR).post(`/api/v1/encounters/${encounterId}/complete`, completeBody()),
    ]);
    await harness.hapi.waitForHeldTransactions(2);
    harness.hapi.releaseTransactions();
    const responses = await racing;

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(responses.find((response) => response.status === 409)?.body).toMatchObject({ errorCode: 'ENCOUNTER_STATE_INVALID' });
    expect(harness.hapi.stored('Condition')).toHaveLength(1);
  });

  it('should return the open encounter with 200 when the doctor opens the same appointment again', async () => {
    const encounterId = await openEncounter();

    const again = await as(DOCTOR).post('/api/v1/encounters', { appointmentId: APPOINTMENT_ID }).expect(200);

    expect(again.body).toMatchObject({ id: encounterId, status: 'in-progress' });
    expect(harness.hapi.stored('Encounter')).toHaveLength(1);
  });

  it('should reject an ICD-10 code outside the seeded ValueSet with 422 INVALID_ICD10_CODE before any write', async () => {
    const encounterId = await openEncounter();

    const response = await as(DOCTOR).post(`/api/v1/encounters/${encounterId}/complete`, completeBody('X99.1')).expect(422);

    expect(response.body).toMatchObject({ errorCode: 'INVALID_ICD10_CODE' });
    expect(harness.hapi.transactions).toHaveLength(1);
  });

  it('should name the offending diagnosis row in details[] and keep the detail text when the ICD-10 code is unknown', async () => {
    const encounterId = await openEncounter();
    const body = completeBody();
    body['diagnoses'] = [
      { code: 'J06.9', display: 'ОРВИ' },
      { code: 'X99.1', display: 'Неизвестный' },
    ];

    const response = await as(DOCTOR).post(`/api/v1/encounters/${encounterId}/complete`, body).expect(422);

    expect(response.body).toMatchObject({
      errorCode: 'INVALID_ICD10_CODE',
      detail: expect.stringContaining('X99.1'),
      details: [{ field: 'diagnoses.1.code', message: expect.stringContaining('X99.1') }],
    });
  });

  it('should name the offending medication row in details[] when the ATC code is not in the seed', async () => {
    const encounterId = await openEncounter();
    const body = completeBody();
    body['medicationRequests'] = [
      { atcCode: 'J01FA10', dosageText: '1 таб 1 раз в день 3 дня' },
      { atcCode: 'R05CB01', dosageText: '2 таб 1 раз в день 3 дня' },
    ];

    const response = await as(DOCTOR).post(`/api/v1/encounters/${encounterId}/complete`, body).expect(422);

    expect(response.body).toMatchObject({
      errorCode: 'TERMINOLOGY_NOT_FOUND',
      detail: expect.stringContaining('R05CB01'),
      details: [{ field: 'medicationRequests.1.atcCode', message: expect.stringContaining('R05CB01') }],
    });
    expect(harness.hapi.stored('Condition')).toHaveLength(0);
  });

  it('should reject a malformed ICD-10 code with 400 VALIDATION_ERROR', async () => {
    const encounterId = await openEncounter();

    const response = await as(DOCTOR).post(`/api/v1/encounters/${encounterId}/complete`, completeBody('орви')).expect(400);

    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_ERROR' });
  });

  it('should refuse a doctor who is not the participant with 403 COMPARTMENT_VIOLATION', async () => {
    const encounterId = await openEncounter();

    const response = await as(OTHER_DOCTOR).post(`/api/v1/encounters/${encounterId}/complete`, completeBody()).expect(403);

    expect(response.body).toMatchObject({ errorCode: 'COMPARTMENT_VIOLATION' });
  });

  it('should refuse a patient token with 403 FORBIDDEN_SCOPE when it opens an encounter', async () => {
    // ADR-009 guard order: JWT → scope → role, so a `patient/*` token stops at the scope check.
    const response = await as(PATIENT).post('/api/v1/encounters', { appointmentId: APPOINTMENT_ID }).expect(403);

    expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_SCOPE' });
    expect(harness.hapi.transactions).toHaveLength(0);
  });

  it('should refuse an admin token with 403 FORBIDDEN_ROLE when it opens an encounter', async () => {
    const response = await as(ADMIN).post('/api/v1/encounters', { appointmentId: APPOINTMENT_ID }).expect(403);

    expect(response.body).toMatchObject({ errorCode: 'FORBIDDEN_ROLE' });
    expect(harness.hapi.transactions).toHaveLength(0);
  });

  it('should show the completed clinical content to the participant doctor when the encounter is read', async () => {
    const encounterId = await openEncounter();
    await as(DOCTOR).post(`/api/v1/encounters/${encounterId}/complete`, completeBody()).expect(200);

    const response = await as(DOCTOR).get(`/api/v1/encounters/${encounterId}`).expect(200);

    expect(response.body).toMatchObject({
      status: 'finished',
      summary: 'Жалобы на заложенность носа, субфебрилитет',
      recommendations: 'Обильное тёплое питьё, контроль температуры',
      diagnoses: [{ code: 'J06.9', verificationStatus: 'confirmed' }],
      observations: [{ code: '20006', value: 36.6, unit: 'Cel' }],
      serviceRequests: [{ code: '10008', note: 'Натощак' }],
      medicationRequests: [{ atcCode: 'J01FA10', dosageText: '1 таб 1 раз в день 3 дня' }],
    });
  });
});
