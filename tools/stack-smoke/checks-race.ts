import { isoDay } from './checks-catalog-read';
import { pollUntil } from './polling';
import { asArray, bodyObject, expectDefined, expectEqual, expectPage, expectProblem, expectShape, expectStatus, expectTrue } from './smoke-assert';
import { APPOINTMENT_SHAPE, APPOINTMENT_VIEW_SHAPE } from './smoke-shapes';
import type { SmokeStep } from './smoke-runner';
import type { ApiResponse, JsonObject, Session } from './smoke-types';
import { newKey, type Suite } from './suite';

const GROUP = 'BR-001 race + cancel';
const NOSHOW_GROUP = 'no-show';

function book(suite: Suite, session: Session, slotId: string): Promise<ApiResponse> {
  // No free-text reason: the third demo patient has no consent on purpose, and without one `block` refuses a reason (ADR-019).
  const body = { slotId };
  return suite.api.post('/api/v1/appointments', { session, body, headers: { 'Idempotency-Key': newKey() } });
}

function cancel(suite: Suite, session: Session, appointmentId: string): Promise<ApiResponse> {
  return suite.api.post(`/api/v1/appointments/${appointmentId}/cancel`, { session, body: { reason: 'Отмена в рамках smoke-проверки' } });
}

/** Whether the doctor's public slot list offers `slotId` as free right now (the list is cached for seconds). */
async function isOffered(suite: Suite, slotId: string): Promise<boolean> {
  const response = await suite.api.get(`/api/v1/doctors/${suite.accounts.doctorId}/slots`, { query: { from: isoDay(1), to: isoDay(14) } });
  return asArray(bodyObject(response)['items'], 'items').some((item) => (item as JsonObject)['id'] === slotId);
}

/** The race and its winner, shared by the steps of one chain. */
interface Race {
  readonly slotId: string;
  winner: string;
  winnerSession: Session;
}

function raceStep(suite: Suite, race: Race): SmokeStep {
  const { sessions } = suite;
  return {
    name: 'two concurrent POST /appointments for one free slot -> exactly one 201 and one 409 SLOT_CONFLICT',
    run: async () => {
      const attempts = await Promise.all([book(suite, sessions.otherPatient, race.slotId), book(suite, sessions.thirdPatient, race.slotId)]);
      const created = attempts.filter((attempt) => attempt.status === 201);
      const refused = attempts.filter((attempt) => attempt.status === 409);
      expectEqual(created.length, 1, 'number of 201 answers');
      expectEqual(refused.length, 1, 'number of 409 answers');
      expectProblem(expectDefined(refused[0], 'the 409 answer'), 409, 'SLOT_CONFLICT');
      race.winner = String(expectShape(expectDefined(created[0], 'the 201 answer').body, APPOINTMENT_SHAPE, 'appointment')['id']);
      race.winnerSession = attempts[0]?.status === 201 ? sessions.otherPatient : sessions.thirdPatient;
    },
  };
}

function cancelSteps(suite: Suite, race: Race): SmokeStep[] {
  return [
    {
      name: 'POST /appointments/{id}/cancel by the owner -> 200 cancelled with the reason',
      run: async () => {
        const response = await cancel(suite, race.winnerSession, race.winner);
        expectStatus(response, 200);
        const cancelled = expectShape(response.body, APPOINTMENT_SHAPE, 'cancelled appointment');
        expectEqual(cancelled['status'], 'cancelled', 'status');
        expectTrue(String(cancelled['cancelReason']).length >= 3, 'the cancellation reason was not stored');
      },
    },
    {
      name: 'cancelling again -> 409 APPOINTMENT_NOT_CANCELLABLE',
      run: async () => expectProblem(await cancel(suite, race.winnerSession, race.winner), 409, 'APPOINTMENT_NOT_CANCELLABLE'),
    },
    cancelledListStep(suite, race),
  ];
}

function cancelledListStep(suite: Suite, race: Race): SmokeStep {
  return (
    {
      name: 'GET /appointments?status=cancelled lists the cancelled appointment; status=booked&upcoming=true does not',
      run: async () => {
        const list = async (query: Record<string, string | number | boolean>): Promise<readonly JsonObject[]> =>
          expectPage(await suite.api.get('/api/v1/appointments', { session: race.winnerSession, query: { ...query, sortOrder: 'desc', pageSize: 100 } }), APPOINTMENT_VIEW_SHAPE);
        const cancelled = await list({ status: 'cancelled' });
        expectTrue(cancelled.some((item) => item['id'] === race.winner), 'the cancelled appointment is not listed under status=cancelled');
        expectTrue(cancelled.every((item) => item['status'] === 'cancelled'), 'status=cancelled returned another status');
        const booked = await list({ status: 'booked', upcoming: true });
        expectTrue(!booked.some((item) => item['id'] === race.winner), 'the cancelled appointment is listed under status=booked');
        const unfiltered = await list({ upcoming: true });
        expectTrue(unfiltered.some((item) => item['id'] === race.winner), 'upcoming=true alone no longer includes the cancelled appointment (semantics changed)');
      },
    }
  );
}

function rebookSteps(suite: Suite, race: Race): SmokeStep[] {
  const { sessions } = suite;
  return [
    {
      name: 'the cancelled slot is free again: the public list offers it and another patient can book it',
      run: async () => {
        await pollUntil(suite.config, 'the cancelled slot to be offered as free', async () => ((await isOffered(suite, race.slotId)) ? true : undefined));
        const again = await book(suite, sessions.patient, race.slotId);
        expectStatus(again, 201);
        race.winner = String(bodyObject(again)['id']);
      },
    },
    {
      name: 'the admin may cancel any booked appointment (POST /appointments/{id}/cancel as ADMIN)',
      run: async () => {
        expectStatus(await cancel(suite, sessions.admin, race.winner), 200);
        expectProblem(await cancel(suite, sessions.admin, race.winner), 409, 'APPOINTMENT_NOT_CANCELLABLE');
      },
    },
  ];
}

/** BR-001: two patients, one free slot, fired at the same time -> exactly one 201 and one 409 SLOT_CONFLICT. */
export async function raceChecks(suite: Suite, slots: readonly JsonObject[]): Promise<void> {
  const race: Race = { slotId: String((slots[1] as JsonObject)['id']), winner: '', winnerSession: suite.sessions.otherPatient };
  await suite.runner.chain(GROUP, [raceStep(suite, race), ...cancelSteps(suite, race), ...rebookSteps(suite, race)]);
}

/** FR-006: the doctor marks a booked appointment as a no-show; the slot stays busy; a second mark is refused. */
export async function noShowChecks(suite: Suite, slots: readonly JsonObject[]): Promise<void> {
  const { runner, api, sessions } = suite;
  const slotId = String((slots[2] as JsonObject)['id']);
  let appointment = '';
  await runner.chain(NOSHOW_GROUP, [
    {
      name: 'a patient books a slot for the no-show scenario',
      run: async () => {
        const response = await book(suite, sessions.thirdPatient, slotId);
        expectStatus(response, 201);
        appointment = String(bodyObject(response)['id']);
      },
    },
    {
      name: 'POST /doctor/appointments/{id}/noshow by the doctor -> 200 noshow',
      run: async () => {
        const response = await api.post(`/api/v1/doctor/appointments/${appointment}/noshow`, { session: sessions.doctor });
        expectStatus(response, 200);
        expectEqual(expectShape(response.body, APPOINTMENT_SHAPE, 'appointment')['status'], 'noshow', 'status');
      },
    },
    {
      name: 'a no-show cannot be marked twice (409 ENCOUNTER_STATE_INVALID) or cancelled (409 APPOINTMENT_NOT_CANCELLABLE)',
      run: async () => {
        expectProblem(await api.post(`/api/v1/doctor/appointments/${appointment}/noshow`, { session: sessions.doctor }), 409, 'ENCOUNTER_STATE_INVALID');
        expectProblem(await cancel(suite, sessions.thirdPatient, appointment), 409, 'APPOINTMENT_NOT_CANCELLABLE');
      },
    },
  ]);
}
