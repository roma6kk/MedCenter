import { bodyObject, expectDefined, expectEqual, expectProblem } from './smoke-assert';
import type { ApiResponse } from './smoke-types';
import type { Suite } from './suite';

const GROUP = 'compartment (ADR-013)';

type Attempt = readonly [string, () => Promise<ApiResponse>];

/** What the intruder tries; every attempt must be refused with 403 COMPARTMENT_VIOLATION. */
async function expectRefused(suite: Suite, who: string, attempts: readonly Attempt[]): Promise<void> {
  for (const [label, call] of attempts) {
    await suite.runner.check(GROUP, `${who}: ${label} -> 403 COMPARTMENT_VIOLATION`, async () => {
      expectProblem(await call(), 403, 'COMPARTMENT_VIOLATION');
    });
  }
}

function otherPatientAttempts(suite: Suite, ids: { patientId: string; appointmentId: string }): Attempt[] {
  const { api, sessions } = suite;
  const session = sessions.otherPatient;
  const { patientId, appointmentId } = ids;
  return [
    ['GET /patients/{other patient}', () => api.get(`/api/v1/patients/${patientId}`, { session })],
    ['GET /patients/{other patient}/related', () => api.get(`/api/v1/patients/${patientId}/related`, { session })],
    ['GET /patients/{other patient}/history', () => api.get(`/api/v1/patients/${patientId}/history`, { session })],
    ['GET /patients/{other patient}/prescriptions', () => api.get(`/api/v1/patients/${patientId}/prescriptions`, { session })],
    ["GET /appointments/{another patient's}", () => api.get(`/api/v1/appointments/${appointmentId}`, { session })],
    ["POST /appointments/{another patient's}/cancel", () => api.post(`/api/v1/appointments/${appointmentId}/cancel`, { session, body: { reason: 'чужая запись' } })],
  ];
}

function otherDoctorAttempts(suite: Suite, ids: { patientId: string; appointmentId: string; encounterId: string }): Attempt[] {
  const { api, sessions } = suite;
  const session = sessions.otherDoctor;
  const { patientId, appointmentId, encounterId } = ids;
  return [
    ['GET /patients/{id} of a patient without a shared appointment', () => api.get(`/api/v1/patients/${patientId}`, { session })],
    ['GET /appointments/{id} of another doctor', () => api.get(`/api/v1/appointments/${appointmentId}`, { session })],
    ['GET /encounters/{id} of another doctor', () => api.get(`/api/v1/encounters/${encounterId}`, { session })],
    ["POST /encounters for another doctor's appointment", () => api.post('/api/v1/encounters', { session, body: { appointmentId } })],
  ];
}

/** Data of the patient of the clinical chain must not leak to another patient or to a doctor who is not a participant. */
export async function compartmentChecks(suite: Suite): Promise<void> {
  const { api, sessions, chain } = suite;
  const ids = {
    patientId: expectDefined(chain.patientId, 'the chain patient id'),
    appointmentId: expectDefined(chain.appointmentId, 'the chain appointment id'),
    encounterId: expectDefined(chain.encounterId, 'the chain encounter id'),
  };
  await expectRefused(suite, 'patient reading another patient', otherPatientAttempts(suite, ids));
  await expectRefused(suite, 'doctor outside the compartment', otherDoctorAttempts(suite, ids));
  await suite.runner.check(GROUP, "a `patient` query parameter is ignored: /me/history stays the caller's", async () => {
    const response = await api.get('/api/v1/me/history', { session: sessions.otherPatient, query: { patient: ids.patientId } });
    const items = bodyObject(response)['items'] as readonly Record<string, unknown>[];
    expectEqual(items.some((item) => item['id'] === ids.encounterId), false, 'the chain encounter in the intruder history');
  });
}
