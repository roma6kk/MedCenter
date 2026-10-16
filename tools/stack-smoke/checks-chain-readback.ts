import { bodyObject, expectDefined, expectEqual, expectPage, expectShape, expectStatus, expectTrue } from './smoke-assert';
import { HISTORY_ITEM_SHAPE, PATIENT_SHAPE, PRESCRIPTION_SHAPE } from './smoke-shapes';
import type { SmokeStep } from './smoke-runner';
import type { Session } from './smoke-types';
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

function sharedRecordStep(suite: Suite, readers: readonly Reader[]): SmokeStep {
  const { api, chain } = suite;
  return {
    name: 'GET /patients/{id}/history and /prescriptions -> 200 for the owner, the treating doctor and the admin',
    run: async () => {
      const patientId = expectDefined(chain.patientId, 'the patient id');
      for (const [who, session] of readers) {
        const history = expectPage(await api.get(`/api/v1/patients/${patientId}/history`, { session }), HISTORY_ITEM_SHAPE);
        expectTrue(history.some((item) => item['id'] === chain.encounterId), `${who} does not see the encounter in the patient history`);
        expectPage(await api.get(`/api/v1/patients/${patientId}/prescriptions`, { session }), PRESCRIPTION_SHAPE);
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

/** Steps 15-17: what the finished encounter left in the patient's record, read by each party that may read it. */
export function readbackSteps(suite: Suite): SmokeStep[] {
  const { sessions } = suite;
  const readers: readonly Reader[] = [['patient', sessions.patient], ['doctor', sessions.doctor], ['admin', sessions.admin]];
  return [...ownRecordSteps(suite), sharedRecordStep(suite, readers), patientCardStep(suite, readers)];
}
