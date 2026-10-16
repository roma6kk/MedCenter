import { isoDay } from './checks-catalog-read';
import { pollUntil } from './polling';
import { asArray, bodyObject, expectEqual, expectPage, expectProblem, expectShape, expectStatus, expectTrue } from './smoke-assert';
import { APPOINTMENT_SHAPE, APPOINTMENT_VIEW_SHAPE, DOCTOR_SHAPE } from './smoke-shapes';
import type { SmokeStep } from './smoke-runner';
import type { JsonObject } from './smoke-types';
import { newKey, type Suite } from './suite';

/** What the booking steps hand to each other: the slot, the request, the first answer. */
interface Booking {
  readonly slot: JsonObject;
  readonly key: string;
  readonly body: { readonly slotId: string; readonly reason: string };
  firstAnswer: string;
}

function findSlotStep(suite: Suite, booking: Booking): SmokeStep {
  const { api, sessions, accounts, chain } = suite;
  return {
    name: 'patient finds the doctor (GET /doctors) and a free slot (GET /doctors/{id}/slots)',
    run: async () => {
      const doctors = expectPage(await api.get('/api/v1/doctors', { session: sessions.patient }), DOCTOR_SHAPE);
      expectTrue(doctors.some((doctor) => doctor['id'] === accounts.doctorId), 'the doctor is not in the catalog');
      chain.slot = { id: String(booking.slot['id']), start: String(booking.slot['start']) };
    },
  };
}

function bookStep(suite: Suite, booking: Booking): SmokeStep {
  const { api, sessions, accounts, chain } = suite;
  const patient = sessions.patient;
  return {
    name: 'POST /appointments with an Idempotency-Key -> 201 booked, for this patient and this doctor',
    run: async () => {
      const response = await api.post('/api/v1/appointments', { session: patient, body: booking.body, headers: { 'Idempotency-Key': booking.key } });
      expectStatus(response, 201);
      booking.firstAnswer = response.text;
      const appointment = expectShape(response.body, APPOINTMENT_SHAPE, 'appointment');
      expectEqual(appointment['status'], 'booked', 'status');
      expectEqual(appointment['slotId'], booking.slot['id'], 'slotId');
      expectEqual(appointment['start'], booking.slot['start'], 'start');
      expectEqual(appointment['patientId'], patient.claims.patient, 'patientId (the token compartment)');
      expectEqual(appointment['practitionerRoleId'], accounts.doctorRoleId, 'practitionerRoleId');
      expectEqual(appointment['doctorId'], accounts.doctorId, 'doctorId (Practitioner, API §6.1)');
      chain.appointmentId = String(appointment['id']);
      chain.patientId = String(appointment['patientId']);
      chain.serviceId = String(appointment['serviceId']);
    },
  };
}

function replayAndConflictSteps(suite: Suite, booking: Booking): SmokeStep[] {
  const { api, sessions } = suite;
  return [
    {
      name: 'the same Idempotency-Key replays the same appointment',
      run: async () => {
        const replay = await api.post('/api/v1/appointments', { session: sessions.patient, body: booking.body, headers: { 'Idempotency-Key': booking.key } });
        expectStatus(replay, 201);
        expectEqual(replay.text, booking.firstAnswer, 'the replayed answer');
      },
    },
    {
      name: 'a booked slot refuses a second booking with a new key -> 409 SLOT_CONFLICT',
      run: async () => {
        const response = await api.post('/api/v1/appointments', { session: sessions.otherPatient, body: booking.body, headers: { 'Idempotency-Key': newKey() } });
        expectProblem(response, 409, 'SLOT_CONFLICT');
      },
    },
  ];
}

function patientReadsStep(suite: Suite): SmokeStep {
  const { api, sessions, accounts, chain } = suite;
  const session = sessions.patient;
  return {
    name: 'patient sees it in GET /appointments?upcoming=true and GET /appointments/{id} (with names)',
    run: async () => {
      const listed = expectPage(await api.get('/api/v1/appointments', { session, query: { upcoming: true, pageSize: 100 } }), APPOINTMENT_VIEW_SHAPE);
      expectTrue(listed.some((item) => item['id'] === chain.appointmentId), 'the appointment is not in the patient list');
      const one = await api.get(`/api/v1/appointments/${chain.appointmentId}`, { session });
      expectStatus(one, 200);
      const view = expectShape(one.body, APPOINTMENT_VIEW_SHAPE, 'appointment view');
      expectEqual(view['doctorId'], accounts.doctorId, 'doctorId of the view');
      expectTrue(typeof view['doctorName'] === 'string' && typeof view['serviceName'] === 'string', 'the view lacks doctorName/serviceName');
    },
  };
}

function staffReadsStep(suite: Suite, booking: Booking): SmokeStep {
  const { api, sessions, chain } = suite;
  return {
    name: 'doctor sees it in GET /doctor/appointments; doctor and admin open GET /appointments/{id}',
    run: async () => {
      const day = String(booking.slot['start']).slice(0, 10);
      const query = { from: day, to: day, pageSize: 100 };
      const items = expectPage(await api.get('/api/v1/doctor/appointments', { session: sessions.doctor, query }), APPOINTMENT_VIEW_SHAPE);
      expectTrue(items.some((item) => item['id'] === chain.appointmentId), 'the appointment is not in the doctor list');
      for (const session of [sessions.doctor, sessions.admin]) {
        expectStatus(await api.get(`/api/v1/appointments/${chain.appointmentId}`, { session }), 200);
      }
    },
  };
}

function slotGoneStep(suite: Suite, booking: Booking): SmokeStep {
  const { api, accounts } = suite;
  return {
    name: 'GET /doctors/{id}/slots stops offering the booked slot (cache TTL aside)',
    run: async () => {
      await pollUntil(suite.config, 'the booked slot to leave the free list', async () => {
        const response = await api.get(`/api/v1/doctors/${accounts.doctorId}/slots`, { query: { from: isoDay(1), to: isoDay(14) } });
        const stillFree = asArray(bodyObject(response)['items'], 'items').some((item) => (item as JsonObject)['id'] === booking.slot['id']);
        return stillFree ? undefined : true;
      });
    },
  };
}

/** Steps 1-7 of the clinical chain: the patient finds a doctor and a free slot and books it. */
export function bookingSteps(suite: Suite, slots: readonly JsonObject[]): SmokeStep[] {
  const slot = slots[0] as JsonObject;
  const booking: Booking = { slot, key: newKey(), body: { slotId: String(slot['id']), reason: 'Контрольный осмотр (smoke)' }, firstAnswer: '' };
  return [
    findSlotStep(suite, booking),
    bookStep(suite, booking),
    ...replayAndConflictSteps(suite, booking),
    patientReadsStep(suite),
    staffReadsStep(suite, booking),
    slotGoneStep(suite, booking),
  ];
}
