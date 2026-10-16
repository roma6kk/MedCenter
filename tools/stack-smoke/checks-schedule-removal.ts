import { isoDay } from './checks-catalog-read';
import { asArray, bodyObject, expectDefined, expectEqual, expectPage, expectProblem, expectShape, expectStatus, expectTrue, type FieldSpec } from './smoke-assert';
import { APPOINTMENT_SHAPE, GENERATE_SHAPE, ROOM_SHAPE, SCHEDULE_SHAPE, SERVICE_SHAPE, SLOT_SHAPE } from './smoke-shapes';
import type { SmokeStep } from './smoke-runner';
import type { ApiResponse, JsonObject } from './smoke-types';
import { newKey, type Suite } from './suite';

const GROUP = 'schedule removal after a cancelled booking';
const ADMIN = '/api/v1/admin';
const SATURDAY = [{ dayOfWeek: 'SA', startTime: '09:00', endTime: '10:00' }];
/** Disjoint from the horizons of the admin catalog chain (days 60-74 and 120-130), so BR-007 never fires. */
const HORIZON = { horizonFrom: isoDay(100), horizonTo: isoDay(114) };
const MAX_PAGE_SIZE = 100;

/**
 * What the steps hand to each other. The schedule uses the demo room and service, not new ones: HAPI keeps
 * a removed schedule (the cancelled Appointment still references its slot), and a schedule that is kept
 * would block deleting its room and service. What one run leaves behind is therefore only that
 * deactivated schedule, its retired slot and the cancelled appointment - history, not a blocker.
 */
interface Removal {
  schedule: string;
  slotId: string;
  appointment: string;
  /** The booking was cancelled by a step (the janitor cancels a live one before it removes the schedule). */
  cancelled: boolean;
  /** Every step ran: nothing is left for the janitor. */
  finished: boolean;
}

async function firstIdOf(suite: Suite, path: string, shape: FieldSpec): Promise<string> {
  const items = expectPage(await suite.api.get(path, { session: suite.sessions.admin, query: { pageSize: MAX_PAGE_SIZE } }), shape);
  return String(expectDefined(items[0], `the first item of ${path}`)['id']);
}

function createStep(suite: Suite, removal: Removal): SmokeStep {
  const { api, sessions, accounts } = suite;
  const session = sessions.admin;
  return {
    name: 'POST /admin/schedules (demo room and service, a disjoint horizon) and POST .../generate -> 201',
    run: async () => {
      const roomId = await firstIdOf(suite, '/api/v1/rooms', ROOM_SHAPE);
      const serviceId = await firstIdOf(suite, '/api/v1/services', SERVICE_SHAPE);
      const body = { practitionerRoleId: accounts.doctorRoleId, roomId, serviceId, ...HORIZON, windows: SATURDAY, slotDurationMin: 30 };
      const created = await api.post(`${ADMIN}/schedules`, { session, body });
      expectStatus(created, 201);
      removal.schedule = String(expectShape(created.body, SCHEDULE_SHAPE, 'schedule')['id']);
      const range = { from: HORIZON.horizonFrom, to: HORIZON.horizonTo };
      const generated = await api.post(`${ADMIN}/schedules/${removal.schedule}/generate`, { session, body: range, headers: { 'Idempotency-Key': newKey() } });
      expectStatus(generated, 201);
      expectTrue(Number(expectShape(generated.body, GENERATE_SHAPE, 'generate')['generated']) > 0, 'no slot was generated');
    },
  };
}

function bookStep(suite: Suite, removal: Removal): SmokeStep {
  const { api, sessions } = suite;
  return {
    name: 'a patient books a free slot of that schedule (POST /appointments) -> 201 booked',
    run: async () => {
      const query = { from: HORIZON.horizonFrom, to: HORIZON.horizonTo, status: 'free' };
      const listed = await api.get(`${ADMIN}/schedules/${removal.schedule}/slots`, { session: sessions.admin, query });
      expectStatus(listed, 200);
      removal.slotId = String(expectShape(expectDefined(asArray(listed.body, 'slots')[0], 'a free slot'), SLOT_SHAPE, 'slot')['id']);
      const body = { slotId: removal.slotId, reason: 'Запись для проверки удаления расписания (smoke)' };
      const booked = await api.post('/api/v1/appointments', { session: sessions.thirdPatient, body, headers: { 'Idempotency-Key': newKey() } });
      expectStatus(booked, 201);
      removal.appointment = String(expectShape(booked.body, APPOINTMENT_SHAPE, 'appointment')['id']);
    },
  };
}

function cascadeDelete(suite: Suite, removal: Removal): Promise<ApiResponse> {
  return suite.api.delete(`${ADMIN}/schedules/${removal.schedule}`, { session: suite.sessions.admin, body: { cascade: true } });
}

function protectedStep(suite: Suite, removal: Removal): SmokeStep {
  return {
    name: 'DELETE /admin/schedules/{id} {cascade:true} while the booking is live -> 409 SCHEDULE_IN_USE (a busy slot protects it)',
    run: async () => expectProblem(await cascadeDelete(suite, removal), 409, 'SCHEDULE_IN_USE'),
  };
}

function cancelStep(suite: Suite, removal: Removal): SmokeStep {
  return {
    name: 'the patient cancels it (POST /appointments/{id}/cancel) -> 200; the slot is free again but the Appointment still names it',
    run: async () => {
      const body = { reason: 'Отмена перед удалением расписания (smoke)' };
      const response = await suite.api.post(`/api/v1/appointments/${removal.appointment}/cancel`, { session: suite.sessions.thirdPatient, body });
      expectStatus(response, 200);
      expectEqual(expectShape(response.body, APPOINTMENT_SHAPE, 'appointment')['status'], 'cancelled', 'status');
      removal.cancelled = true;
    },
  };
}

function removeStep(suite: Suite, removal: Removal): SmokeStep {
  return {
    name: 'DELETE /admin/schedules/{id} {cascade:true} -> 204 although HAPI keeps the slot the cancelled Appointment references',
    run: async () => {
      expectStatus(await cascadeDelete(suite, removal), 204);
      const range = { from: HORIZON.horizonFrom, to: HORIZON.horizonTo };
      const slotsPath = `${ADMIN}/schedules/${removal.schedule}/slots`;
      const free = await suite.api.get(slotsPath, { session: suite.sessions.admin, query: { ...range, status: 'free' } });
      expectEqual(asArray(free.body, 'slots').length, 0, 'free slots left after the cascade delete');
      const retired = await suite.api.get(slotsPath, { session: suite.sessions.admin, query: { ...range, status: 'entered-in-error' } });
      const slots = asArray(retired.body, 'retired slots').map((slot) => expectShape(slot, SLOT_SHAPE, 'slot'));
      expectEqual(JSON.stringify(slots.map((slot) => [slot['id'], slot['status']])), JSON.stringify([[removal.slotId, 'entered-in-error']]), 'the retired slots');
    },
  };
}

/** The list is sorted by id, so the schedule this run created is on the last page. */
async function lastPage(suite: Suite, active: boolean): Promise<readonly JsonObject[]> {
  const { api, sessions, accounts } = suite;
  const query = { doctorId: accounts.doctorRoleId, active, pageSize: MAX_PAGE_SIZE };
  const first = await api.get(`${ADMIN}/schedules`, { session: sessions.admin, query });
  const totalPages = Number(expectShape(bodyObject(first)['meta'], { totalPages: 'number' }, 'meta')['totalPages']);
  return totalPages <= 1 ? expectPage(first, SCHEDULE_SHAPE) : expectPage(await api.get(`${ADMIN}/schedules`, { session: sessions.admin, query: { ...query, page: totalPages } }), SCHEDULE_SHAPE);
}

function afterRemovalStep(suite: Suite, removal: Removal): SmokeStep {
  const { api, sessions } = suite;
  return {
    name: 'the schedule is deactivated (listed under active=false, not under active=true), takes no new slots and the retired slot cannot be booked',
    run: async () => {
      const inactive = (await lastPage(suite, false)).find((item) => item['id'] === removal.schedule);
      expectEqual(expectDefined(inactive, 'the removed schedule under active=false')['isActive'], false, 'isActive');
      expectTrue(!(await lastPage(suite, true)).some((item) => item['id'] === removal.schedule), 'the removed schedule is still listed as active');
      const range = { from: HORIZON.horizonFrom, to: HORIZON.horizonTo };
      expectProblem(await api.post(`${ADMIN}/schedules/${removal.schedule}/generate`, { session: sessions.admin, body: range, headers: { 'Idempotency-Key': newKey() } }), 409, 'CONFLICT');
      const body = { slotId: removal.slotId, reason: 'Повторная запись на снятый слот (smoke)' };
      expectProblem(await api.post('/api/v1/appointments', { session: sessions.otherPatient, body, headers: { 'Idempotency-Key': newKey() } }), 409, 'SLOT_CONFLICT');
    },
  };
}

function repeatStep(suite: Suite, removal: Removal): SmokeStep {
  return {
    name: 'a second DELETE of the removed schedule is safe -> 204',
    run: async () => {
      expectStatus(await cascadeDelete(suite, removal), 204);
      removal.finished = true;
    },
  };
}

/** Janitor for a chain that stopped half way: cancels the booking (a live one would block the removal), then removes the schedule. */
async function removeLeftovers(suite: Suite, removal: Removal): Promise<void> {
  const session = suite.sessions.admin;
  if (removal.appointment !== '' && !removal.cancelled) {
    await suite.api.post(`/api/v1/appointments/${removal.appointment}/cancel`, { session, body: { reason: 'Уборка после неудачного smoke-прогона' } });
  }
  if (removal.schedule !== '') {
    const response = await cascadeDelete(suite, removal);
    if (response.status !== 204) {
      console.warn(`cleanup: DELETE schedule ${removal.schedule} answered HTTP ${response.status}; remove the test schedule by hand`);
    }
  }
}

/**
 * M1 of the live-stack review: a schedule that once had a booking cancelled still has a slot HAPI refuses
 * to delete (409, referential integrity), which used to make `DELETE ... {cascade:true}` answer 502 for good.
 */
export async function scheduleRemovalChecks(suite: Suite): Promise<void> {
  const removal: Removal = { schedule: '', slotId: '', appointment: '', cancelled: false, finished: false };
  await suite.runner.chain(GROUP, [
    createStep(suite, removal),
    bookStep(suite, removal),
    protectedStep(suite, removal),
    cancelStep(suite, removal),
    removeStep(suite, removal),
    afterRemovalStep(suite, removal),
    repeatStep(suite, removal),
  ]);
  if (!removal.finished) {
    await removeLeftovers(suite, removal);
  }
}
