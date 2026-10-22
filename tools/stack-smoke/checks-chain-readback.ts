import { bodyObject, expectDefined, expectDetailField, expectEqual, expectPage, expectProblem, expectShape, expectStatus, expectTrue } from './smoke-assert';
import { APPOINTMENT_VIEW_SHAPE, HISTORY_ITEM_SHAPE, PATIENT_SHAPE, PRESCRIPTION_SHAPE } from './smoke-shapes';
import type { SmokeStep } from './smoke-runner';
import type { JsonObject, Session } from './smoke-types';
import type { Suite } from './suite';

type Reader = readonly [string, Session];

function ownRecordSteps(suite: Suite): SmokeStep[] {
  const { api, sessions, chain } = suite;
  return [
    {
      name: 'patient: GET /me/history -> the finished encounter with diagnosis J06.9',
      run: async () => {
        const items = expectPage(await api.get('/api/v1/me/history', { session: sessions.patient }), HISTORY_ITEM_SHAPE);
        const entry = expectDefined(items.find((item) => item['id'] === chain.encounterId), 'the encounter in /me/history');
        expectEqual(entry['diagnosis'], 'J06.9', 'diagnosis');
        expectEqual(entry['status'], 'finished', 'status');
      },
    },
    {
      name: 'patient: GET /me/prescriptions -> medication J01FA10 tied to the encounter',
      run: async () => {
        const items = expectPage(await api.get('/api/v1/me/prescriptions', { session: sessions.patient }), PRESCRIPTION_SHAPE);
        const medication = expectDefined(items.find((item) => item['kind'] === 'medication' && item['encounterId'] === chain.encounterId), 'the medication prescription');
        expectEqual(medication['atcCode'], 'J01FA10', 'atcCode');
      },
    },
  ];
}

/** ADR-018: the medical record is read by the owner and the treating doctor; the admin is refused. */
function sharedRecordStep(suite: Suite, readers: readonly Reader[]): SmokeStep {
  const { api, chain, sessions } = suite;
  return {
    name: 'GET /patients/{id}/history and /prescriptions -> 200 for the owner and the treating doctor, 403 for the admin',
    run: async () => {
      const patientId = expectDefined(chain.patientId, 'the patient id');
      for (const [who, session] of readers) {
        const history = expectPage(await api.get(`/api/v1/patients/${patientId}/history`, { session }), HISTORY_ITEM_SHAPE);
        expectTrue(history.some((item) => item['id'] === chain.encounterId), `${who} does not see the encounter in the patient history`);
        expectPage(await api.get(`/api/v1/patients/${patientId}/prescriptions`, { session }), PRESCRIPTION_SHAPE);
      }
      for (const path of ['history', 'prescriptions']) {
        expectStatus(await api.get(`/api/v1/patients/${patientId}/${path}`, { session: sessions.admin }), 403);
      }
    },
  };
}

function patientCardStep(suite: Suite, readers: readonly Reader[]): SmokeStep {
  const { api, sessions, chain } = suite;
  return {
    name: 'GET /me/patient, GET /patients/{id}, GET /patients/{id}/related -> the card and an envelope',
    run: async () => {
      const patientId = expectDefined(chain.patientId, 'the patient id');
      const mine = await api.get('/api/v1/me/patient', { session: sessions.patient });
      expectStatus(mine, 200);
      expectEqual(expectShape(mine.body, PATIENT_SHAPE, 'me/patient')['id'], patientId, 'patient id');
      for (const [who, session] of readers) {
        const card = await api.get(`/api/v1/patients/${patientId}`, { session });
        expectStatus(card, 200);
        expectEqual(bodyObject(card)['id'], patientId, `patient id seen by ${who}`);
        expectPage(await api.get(`/api/v1/patients/${patientId}/related`, { session }));
      }
    },
  };
}

/** The patient's own appointments with a `status` filter, newest first so a long demo history cannot push the new one off the page. */
async function listByStatus(suite: Suite, status: string, upcoming = false): Promise<readonly JsonObject[]> {
  const query = { status, sortOrder: 'desc', pageSize: 100, ...(upcoming ? { upcoming: true } : {}) };
  return expectPage(await suite.api.get('/api/v1/appointments', { session: suite.sessions.patient, query }), APPOINTMENT_VIEW_SHAPE);
}

/** API §6.2 `status` filter against the appointment the chain just fulfilled. */
function statusFilterStep(suite: Suite): SmokeStep {
  const { api, sessions, chain } = suite;
  return {
    name: 'GET /appointments?status= -> only the listed statuses (fulfilled has the visit, booked and upcoming do not); a bad status -> 400',
    run: async () => {
      const fulfilled = await listByStatus(suite, 'fulfilled');
      expectTrue(fulfilled.some((item) => item['id'] === chain.appointmentId), 'the finished appointment is not listed under status=fulfilled');
      expectTrue(fulfilled.every((item) => item['status'] === 'fulfilled'), 'status=fulfilled returned another status');
      const booked = await listByStatus(suite, 'booked', true);
      expectTrue(booked.every((item) => item['status'] === 'booked'), 'status=booked returned another status');
      expectTrue(!booked.some((item) => item['id'] === chain.appointmentId), 'the finished appointment is still listed under status=booked');
      const both = await listByStatus(suite, 'booked,fulfilled');
      expectTrue(both.some((item) => item['id'] === chain.appointmentId), 'status=booked,fulfilled lost the finished appointment');
      expectTrue(both.every((item) => item['status'] === 'booked' || item['status'] === 'fulfilled'), 'the comma list returned another status');
      const bad = await api.get('/api/v1/appointments', { session: sessions.patient, query: { status: 'booked,done' } });
      expectProblem(bad, 400, 'VALIDATION_ERROR');
      expectDetailField(bad, 'status');
    },
  };
}

/** Steps 15-17: what the finished encounter left in the patient's record, read by each party that may read it. */
export function readbackSteps(suite: Suite): SmokeStep[] {
  const { sessions } = suite;
  const cardReaders: readonly Reader[] = [['patient', sessions.patient], ['doctor', sessions.doctor], ['admin', sessions.admin]];
  const recordReaders = cardReaders.filter(([who]) => who !== 'admin');
  return [...ownRecordSteps(suite), sharedRecordStep(suite, recordReaders), patientCardStep(suite, cardReaders), statusFilterStep(suite)];
}
