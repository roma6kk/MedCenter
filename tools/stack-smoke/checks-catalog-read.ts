import { SmokeAssertionError, asArray, bodyObject, expectDefined, expectEqual, expectPage, expectProblem, expectShape, expectStatus, expectTrue } from './smoke-assert';
import { DOCTOR_SCHEDULE_SHAPE, DOCTOR_SHAPE, DOCTOR_SLOTS_SHAPE, ROOM_SHAPE, SERVICE_SHAPE, SLOT_SHAPE } from './smoke-shapes';
import type { JsonObject } from './smoke-types';
import type { Suite } from './suite';

const GROUP = 'catalog (public + staff reads)';
const DAY_MS = 24 * 60 * 60 * 1000;

export function isoDay(offsetDays: number, now: number = Date.now()): string {
  return new Date(now + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

/** The free slots of the suite's doctor in the next two weeks, soonest first (public, no token). */
export async function loadFreeSlots(suite: Suite): Promise<readonly JsonObject[]> {
  const response = await suite.api.get(`/api/v1/doctors/${suite.accounts.doctorId}/slots`, { query: { from: isoDay(1), to: isoDay(14) } });
  expectStatus(response, 200);
  const items = asArray(bodyObject(response)['items'], 'items').map((item) => expectShape(item, SLOT_SHAPE, 'slot'));
  const free = items.filter((slot) => slot['status'] === 'free');
  if (free.length < 4) {
    throw new SmokeAssertionError(`the suite needs at least 4 free slots of the demo doctor in the next 14 days, found ${free.length}: re-run "npm run seed:demo"`);
  }
  return free;
}

async function doctorChecks(suite: Suite): Promise<void> {
  const { runner, api, accounts } = suite;
  await runner.check(GROUP, 'GET /doctors (public) -> envelope with the demo doctors', async () => {
    const items = expectPage(await api.get('/api/v1/doctors'), DOCTOR_SHAPE);
    expectTrue(items.length >= 4, `expected the 4 demo doctors, got ${items.length}`);
    expectTrue(items.some((item) => item['id'] === accounts.doctorId), 'the suite doctor is not listed');
  });
  await runner.check(GROUP, 'GET /doctors?search= -> filtered envelope', async () => {
    const items = expectPage(await api.get('/api/v1/doctors', { query: { search: 'Иванова', pageSize: 5 } }), DOCTOR_SHAPE);
    expectTrue(items.length >= 1 && items.every((item) => String(item['name']).includes('Иванова')), 'the search did not narrow the list');
  });
  await runner.check(GROUP, 'GET /doctors/{id} -> the card; unknown id -> 404', async () => {
    const response = await api.get(`/api/v1/doctors/${accounts.doctorId}`);
    expectStatus(response, 200);
    expectEqual(expectShape(response.body, DOCTOR_SHAPE, 'doctor')['id'], accounts.doctorId, 'id');
    expectProblem(await api.get('/api/v1/doctors/00000000-0000-4000-8000-000000000000'), 404, 'NOT_FOUND');
  });
  await runner.check(GROUP, 'GET /doctors -> specialtyCode/specialtySystem and the practitionerRoleIds of the doctor, and ?specialty= takes that same token', async () => {
    const doctor = expectDefined(expectPage(await api.get('/api/v1/doctors', { query: { pageSize: 100 } }), DOCTOR_SHAPE).find((item) => item['id'] === accounts.doctorId), 'the suite doctor in the catalog');
    const roleIds = asArray(doctor['practitionerRoleIds'], 'practitionerRoleIds');
    expectTrue(roleIds.includes(accounts.doctorRoleId), `practitionerRoleIds ${JSON.stringify(roleIds)} lacks the doctor's role`);
    expectTrue(typeof doctor['specialtyCode'] === 'string' && typeof doctor['specialtySystem'] === 'string', 'the doctor card has no specialtyCode/specialtySystem');
    for (const token of [String(doctor['specialtyCode']), `${String(doctor['specialtySystem'])}|${String(doctor['specialtyCode'])}`]) {
      const matches = expectPage(await api.get('/api/v1/doctors', { query: { specialty: token, pageSize: 100 } }), DOCTOR_SHAPE);
      expectTrue(matches.some((item) => item['id'] === accounts.doctorId), `?specialty=${token} does not list the doctor`);
      expectTrue(matches.every((item) => item['specialtyCode'] === doctor['specialtyCode']), `?specialty=${token} listed a doctor of another specialty`);
    }
  });
  await runner.check(GROUP, 'GET /doctors/{id} -> the same practitionerRoleIds and specialty token as the catalog', async () => {
    const card = expectShape((await api.get(`/api/v1/doctors/${accounts.doctorId}`)).body, DOCTOR_SHAPE, 'doctor');
    expectTrue(asArray(card['practitionerRoleIds'], 'practitionerRoleIds').includes(accounts.doctorRoleId), 'the card lacks the doctor role id');
    expectTrue(typeof card['specialtyCode'] === 'string', 'the card has no specialtyCode');
  });
  await runner.check(GROUP, 'GET /doctors/{id}/slots (public) -> free slots, sorted by start', async () => {
    const response = await api.get(`/api/v1/doctors/${accounts.doctorId}/slots`, { query: { from: isoDay(0), to: isoDay(14) } });
    expectStatus(response, 200);
    const body = expectShape(response.body, DOCTOR_SLOTS_SHAPE, 'doctor slots');
    const starts = asArray(body['items'], 'items').map((slot) => String(expectShape(slot, SLOT_SHAPE, 'slot')['start']));
    expectTrue(starts.length > 0, 'the demo doctor has no free slot');
    expectEqual(JSON.stringify(starts), JSON.stringify([...starts].sort()), 'slots sorted by start');
  });
}

async function serviceAndRoomChecks(suite: Suite): Promise<void> {
  const { runner, api, sessions } = suite;
  let serviceId = '';
  await runner.check(GROUP, 'GET /services (public) -> envelope with the demo services', async () => {
    const items = expectPage(await api.get('/api/v1/services', { query: { pageSize: 50 } }), SERVICE_SHAPE);
    expectTrue(items.length >= 6, `expected the 6 demo services, got ${items.length}`);
    serviceId = String(items[0]?.['id']);
  });
  await runner.check(GROUP, 'GET /services/{id} -> the card; unknown id -> 404', async () => {
    const response = await api.get(`/api/v1/services/${expectDefined(serviceId || undefined, 'a service id')}`);
    expectStatus(response, 200);
    expectShape(response.body, SERVICE_SHAPE, 'service');
    expectProblem(await api.get('/api/v1/services/nope-0'), 404, 'NOT_FOUND');
  });
  await runner.check(GROUP, 'GET /rooms (staff, user/*.read) -> envelope with the demo rooms', async () => {
    const items = expectPage(await api.get('/api/v1/rooms', { session: sessions.doctor }), ROOM_SHAPE);
    expectTrue(items.length >= 5, `expected the 5 demo rooms, got ${items.length}`);
  });
}

async function doctorScheduleChecks(suite: Suite): Promise<void> {
  const { runner, api, sessions, accounts } = suite;
  await runner.check(GROUP, 'GET /doctor/schedule (doctor) -> own schedules and slots', async () => {
    const response = await api.get('/api/v1/doctor/schedule', { session: sessions.doctor, query: { from: isoDay(0), to: isoDay(7) } });
    expectStatus(response, 200);
    const body = expectShape(response.body, DOCTOR_SCHEDULE_SHAPE, 'doctor schedule');
    expectEqual(body['practitionerRoleId'], accounts.doctorRoleId, 'practitionerRoleId');
    expectTrue(asArray(body['schedules'], 'schedules').length >= 1, 'the doctor has no schedule');
    expectTrue(asArray(body['items'], 'items').length >= 1, 'the doctor schedule has no slot in the next week');
  });
}

export async function catalogReadChecks(suite: Suite): Promise<void> {
  await doctorChecks(suite);
  await serviceAndRoomChecks(suite);
  await doctorScheduleChecks(suite);
}
