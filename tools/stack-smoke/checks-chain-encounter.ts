import { bodyObject, expectDetailField, expectEqual, expectProblem, expectShape, expectStatus, expectTrue, asArray } from './smoke-assert';
import { APPOINTMENT_SHAPE, ENCOUNTER_DETAILS_SHAPE, ENCOUNTER_SHAPE } from './smoke-shapes';
import type { SmokeStep } from './smoke-runner';
import type { JsonObject } from './smoke-types';
import type { Suite } from './suite';

const OBSERVATIONS = 'https://fhir.by/CodeSystem/nsi-observations';
const NSI_SERVICES = 'https://fhir.by/CodeSystem/nsi-services';

/** A valid completion body; each field can be replaced to build a rejected one. */
export function completionBody(overrides: JsonObject = {}): JsonObject {
  return {
    summary: 'ОРВИ, течение лёгкое',
    diagnoses: [{ code: 'J06.9', display: 'Острая инфекция верхних дыхательных путей неуточнённая', verificationStatus: 'confirmed' }],
    recommendations: 'Покой, обильное питьё, повторный осмотр через 5 дней',
    observations: [{ codeSystem: OBSERVATIONS, code: '20006', value: 36.6, unit: 'Cel' }],
    serviceRequests: [{ codeSystem: NSI_SERVICES, code: '10007', note: 'ЭКГ при сохранении жалоб' }],
    medicationRequests: [{ atcCode: 'J01FA10', dosageText: '500 мг 1 раз в сутки, 3 дня' }],
    ...overrides,
  };
}

function openStep(suite: Suite): SmokeStep {
  const { api, sessions, chain, accounts } = suite;
  return {
    name: 'doctor opens POST /encounters {appointmentId} -> 201 in-progress',
    run: async () => {
      const response = await api.post('/api/v1/encounters', { session: sessions.doctor, body: { appointmentId: chain.appointmentId } });
      expectStatus(response, 201);
      const encounter = expectShape(response.body, ENCOUNTER_SHAPE, 'encounter');
      expectEqual(encounter['status'], 'in-progress', 'status');
      expectEqual(encounter['appointmentId'], chain.appointmentId, 'appointmentId');
      expectEqual(encounter['practitionerRoleId'], accounts.doctorRoleId, 'practitionerRoleId');
      chain.encounterId = String(encounter['id']);
    },
  };
}

function reopenAndReadSteps(suite: Suite): SmokeStep[] {
  const { api, sessions, chain } = suite;
  return [
    {
      name: 'opening it again -> 200 with the same encounter (no second encounter)',
      run: async () => {
        const response = await api.post('/api/v1/encounters', { session: sessions.doctor, body: { appointmentId: chain.appointmentId } });
        expectStatus(response, 200);
        expectEqual(bodyObject(response)['id'], chain.encounterId, 'encounter id of the replay');
      },
    },
    {
      name: 'GET /encounters/{id} (doctor, admin) -> the open encounter',
      run: async () => {
        for (const session of [sessions.doctor, sessions.admin]) {
          const response = await api.get(`/api/v1/encounters/${chain.encounterId}`, { session });
          expectStatus(response, 200);
          expectEqual(expectShape(response.body, ENCOUNTER_DETAILS_SHAPE, 'encounter details')['status'], 'in-progress', 'status');
        }
      },
    },
  ];
}

/** BR-008: an appointment that already has an encounter (here: in progress) cannot become a no-show. */
function noShowWhileOpenStep(suite: Suite): SmokeStep {
  const { api, sessions, chain } = suite;
  return {
    name: 'POST /doctor/appointments/{id}/noshow while the encounter is in progress -> 409 ENCOUNTER_STATE_INVALID',
    run: async () => expectProblem(await api.post(`/api/v1/doctor/appointments/${chain.appointmentId}/noshow`, { session: sessions.doctor }), 409, 'ENCOUNTER_STATE_INVALID'),
  };
}

/** Steps 8-10: the doctor opens the encounter for the booked appointment. */
export function openingSteps(suite: Suite): SmokeStep[] {
  return [openStep(suite), ...reopenAndReadSteps(suite), noShowWhileOpenStep(suite)];
}

/** Step 11: terminology validation of the completion body (API §1: 422 INVALID_ICD10_CODE / TERMINOLOGY_NOT_FOUND). */
export function invalidCodeSteps(suite: Suite): SmokeStep[] {
  const { api, sessions, chain } = suite;
  const complete = (body: JsonObject): ReturnType<typeof api.post> =>
    api.post(`/api/v1/encounters/${chain.encounterId}/complete`, { session: sessions.doctor, body });
  const refused = (label: string, overrides: JsonObject, status: number, errorCode: string): SmokeStep => ({
    name: `complete with ${label} -> ${status} ${errorCode}`,
    run: async () => expectProblem(await complete(completionBody(overrides)), status, errorCode),
  });
  return [
    refused('an ICD-10 code outside the value set (Z99.99)', { diagnoses: [{ code: 'Z99.99', display: 'нет такого кода' }] }, 422, 'INVALID_ICD10_CODE'),
    refused('a malformed ICD-10 code', { diagnoses: [{ code: 'not-a-code', display: 'x' }] }, 400, 'VALIDATION_ERROR'),
    refused('an observation code that is not in НСИ (99999)', { observations: [{ codeSystem: OBSERVATIONS, code: '99999', value: 36.6, unit: 'Cel' }] }, 422, 'TERMINOLOGY_NOT_FOUND'),
    refused('a unit outside UCUM (xyz)', { observations: [{ codeSystem: OBSERVATIONS, code: '20006', value: 36.6, unit: 'xyz' }] }, 422, 'TERMINOLOGY_NOT_FOUND'),
    refused('an ATC code that is not in the seed (Z99ZZ99)', { medicationRequests: [{ atcCode: 'Z99ZZ99', dosageText: 'по схеме' }] }, 422, 'TERMINOLOGY_NOT_FOUND'),
    detailsStep(suite),
    {
      name: 'the encounter is still open after the refused completions',
      run: async () => {
        const response = await api.get(`/api/v1/encounters/${chain.encounterId}`, { session: sessions.doctor });
        expectEqual(bodyObject(response)['status'], 'in-progress', 'status after refused completions');
      },
    },
  ];
}

/** API §1: a 422 names the offending request fields in `details[]` next to the unchanged `detail`. */
function detailsStep(suite: Suite): SmokeStep {
  const { api, sessions, chain } = suite;
  const complete = (overrides: JsonObject): ReturnType<typeof api.post> =>
    api.post(`/api/v1/encounters/${chain.encounterId}/complete`, { session: sessions.doctor, body: completionBody(overrides) });
  return {
    name: '422 names the offending fields in details[] (diagnoses.1.code, medicationRequests.1.atcCode, observations.0.unit) and keeps detail',
    run: async () => {
      const icd = await complete({ diagnoses: [{ code: 'J06.9', display: 'ОРВИ' }, { code: 'Z99.99', display: 'нет такого кода' }] });
      expectProblem(icd, 422, 'INVALID_ICD10_CODE');
      expectTrue(String(bodyObject(icd)['detail']).includes('Z99.99'), 'detail no longer lists the code');
      expectTrue(String(expectDetailField(icd, 'diagnoses.1.code')['message']).includes('Z99.99'), 'details[] message does not name the code');
      const atc = await complete({ medicationRequests: [{ atcCode: 'J01FA10', dosageText: 'по схеме' }, { atcCode: 'Z99ZZ99', dosageText: 'по схеме' }] });
      expectProblem(atc, 422, 'TERMINOLOGY_NOT_FOUND');
      expectDetailField(atc, 'medicationRequests.1.atcCode');
      const unit = await complete({ observations: [{ codeSystem: OBSERVATIONS, code: '20006', value: 36.6, unit: 'xyz' }] });
      expectProblem(unit, 422, 'TERMINOLOGY_NOT_FOUND');
      expectDetailField(unit, 'observations.0.unit');
    },
  };
}

function completeStep(suite: Suite): SmokeStep {
  const { api, sessions, chain } = suite;
  return {
    name: 'complete with ICD-10 J06.9, observation 36.6 Cel, medication J01FA10 -> 200 finished',
    run: async () => {
      const response = await api.post(`/api/v1/encounters/${chain.encounterId}/complete`, { session: sessions.doctor, body: completionBody() });
      expectStatus(response, 200);
      const encounter = expectShape(response.body, ENCOUNTER_SHAPE, 'encounter');
      expectEqual(encounter['status'], 'finished', 'status');
      expectEqual(JSON.stringify(encounter['diagnosisCodes']), JSON.stringify(['J06.9']), 'diagnosisCodes');
    },
  };
}

function clinicalContentStep(suite: Suite): SmokeStep {
  const { api, sessions, chain } = suite;
  return {
    name: 'GET /encounters/{id} -> diagnosis, observation 36.6 Cel, medication and service request',
    run: async () => {
      const response = await api.get(`/api/v1/encounters/${chain.encounterId}`, { session: sessions.doctor });
      expectStatus(response, 200);
      const details = expectShape(response.body, ENCOUNTER_DETAILS_SHAPE, 'encounter details');
      const observation = asArray(details['observations'], 'observations')[0] as JsonObject;
      expectEqual(observation['value'], 36.6, 'observation value');
      expectEqual(observation['unit'], 'Cel', 'observation unit');
      expectEqual((asArray(details['medicationRequests'], 'medicationRequests')[0] as JsonObject)['atcCode'], 'J01FA10', 'atcCode');
      expectTrue(asArray(details['serviceRequests'], 'serviceRequests').length === 1, 'the service request is missing');
      expectEqual((asArray(details['diagnoses'], 'diagnoses')[0] as JsonObject)['code'], 'J06.9', 'diagnosis code');
    },
  };
}

/** BR-008: completing the encounter set the appointment to `fulfilled`, in every view of it. */
function fulfilledStep(suite: Suite): SmokeStep {
  const { api, sessions, chain } = suite;
  return {
    name: 'GET /appointments/{id} (patient, doctor, admin) -> status fulfilled after the encounter was completed',
    run: async () => {
      for (const session of [sessions.patient, sessions.doctor, sessions.admin]) {
        const response = await api.get(`/api/v1/appointments/${chain.appointmentId}`, { session });
        expectStatus(response, 200);
        expectEqual(bodyObject(response)['status'], 'fulfilled', `status seen by ${session.role}`);
      }
    },
  };
}

/** BR-008: a visit that took place can be neither marked as a no-show nor cancelled. */
function afterVisitStep(suite: Suite): SmokeStep {
  const { api, sessions, chain } = suite;
  return {
    name: 'noshow after the finished encounter -> 409 ENCOUNTER_STATE_INVALID; cancel -> 409 APPOINTMENT_NOT_CANCELLABLE; still fulfilled',
    run: async () => {
      expectProblem(await api.post(`/api/v1/doctor/appointments/${chain.appointmentId}/noshow`, { session: sessions.doctor }), 409, 'ENCOUNTER_STATE_INVALID');
      const cancel = await api.post(`/api/v1/appointments/${chain.appointmentId}/cancel`, { session: sessions.patient, body: { reason: 'Приём уже состоялся (smoke)' } });
      expectProblem(cancel, 409, 'APPOINTMENT_NOT_CANCELLABLE');
      const response = await api.get(`/api/v1/appointments/${chain.appointmentId}`, { session: sessions.patient });
      expectEqual(expectShape(response.body, APPOINTMENT_SHAPE, 'appointment')['status'], 'fulfilled', 'status after the refused noshow and cancel');
    },
  };
}

/** Steps 12-16: the valid completion, the fulfilled appointment, its replay and the clinical content it left. */
export function completionSteps(suite: Suite): SmokeStep[] {
  const { api, sessions, chain } = suite;
  return [
    completeStep(suite),
    fulfilledStep(suite),
    afterVisitStep(suite),
    {
      name: 'completing it again -> 409 ENCOUNTER_STATE_INVALID',
      run: async () => {
        const response = await api.post(`/api/v1/encounters/${chain.encounterId}/complete`, { session: sessions.doctor, body: completionBody() });
        expectProblem(response, 409, 'ENCOUNTER_STATE_INVALID');
      },
    },
    clinicalContentStep(suite),
  ];
}
