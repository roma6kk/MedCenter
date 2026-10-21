import { isoDay } from './checks-catalog-read';
import { asArray, bodyObject, expectEqual, expectPage, expectProblem, expectShape, expectStatus, expectTrue } from './smoke-assert';
import { GENERATE_SHAPE, ROOM_SHAPE, ROOM_USAGE_SHAPE, SCHEDULE_SHAPE, SERVICE_SHAPE, SLOT_SHAPE } from './smoke-shapes';
import type { SmokeStep } from './smoke-runner';
import { newKey, runTag, type Suite } from './suite';

const GROUP = 'admin catalog (rooms, services, schedules)';
const NSI_SERVICES = 'https://fhir.by/CodeSystem/nsi-services';
const SATURDAY = [{ dayOfWeek: 'SA', startTime: '09:00', endTime: '12:00' }];
const HORIZON = { horizonFrom: isoDay(60), horizonTo: isoDay(74) };
const API_PREFIX = '/api/v1/admin';

/** Ids that the steps of one lifecycle hand to each other. */
interface Ids {
  room: string;
  /** A second room, made only to prove that a rename to a taken identifier is refused. */
  otherRoom: string;
  service: string;
  schedule: string;
  futureSchedule: string;
}

/** API §4.4/4.5: `Location.identifier` of a room is unique -> 409 CONFLICT on create and on rename. */
function duplicateRoomStep(suite: Suite, ids: Ids, tag: string): SmokeStep {
  const { api, sessions } = suite;
  const session = sessions.admin;
  return {
    name: 'POST /admin/rooms with a taken identifier -> 409 CONFLICT; PATCH of another room to it -> 409 CONFLICT (also in another letter case)',
    run: async () => {
      const identifier = `smoke-${tag}`;
      const duplicate = await api.post(`${API_PREFIX}/rooms`, { session, body: { identifier, name: `Smoke ${tag} duplicate` } });
      expectProblem(duplicate, 409, 'CONFLICT');
      expectTrue(String(bodyObject(duplicate)['detail']).includes(identifier), 'the 409 detail does not name the identifier');
      expectProblem(await api.post(`${API_PREFIX}/rooms`, { session, body: { identifier: identifier.toUpperCase(), name: `Smoke ${tag} upper` } }), 409, 'CONFLICT');
      const other = await api.post(`${API_PREFIX}/rooms`, { session, body: { identifier: `smoke-${tag}-b`, name: `Smoke ${tag} b` } });
      expectStatus(other, 201);
      ids.otherRoom = String(expectShape(other.body, ROOM_SHAPE, 'room')['id']);
      expectProblem(await api.patch(`${API_PREFIX}/rooms/${ids.otherRoom}`, { session, body: { identifier } }), 409, 'CONFLICT');
      expectStatus(await api.patch(`${API_PREFIX}/rooms/${ids.otherRoom}`, { session, body: { identifier: `smoke-${tag}-b`, name: `Smoke ${tag} b2` } }), 200);
      expectStatus(await api.delete(`${API_PREFIX}/rooms/${ids.otherRoom}`, { session }), 204);
      ids.otherRoom = '';
    },
  };
}

function roomSteps(suite: Suite, ids: Ids, tag: string): SmokeStep[] {
  const { api, sessions } = suite;
  const session = sessions.admin;
  return [
    {
      name: 'POST /admin/rooms -> 201',
      run: async () => {
        const body = { identifier: `smoke-${tag}`, name: `Smoke ${tag}`, floor: 3, description: 'created by the stack smoke' };
        const response = await api.post(`${API_PREFIX}/rooms`, { session, body });
        expectStatus(response, 201);
        ids.room = String(expectShape(response.body, ROOM_SHAPE, 'room')['id']);
      },
    },
    duplicateRoomStep(suite, ids, tag),
    {
      name: 'PATCH /admin/rooms/{id} -> 200; GET /admin/rooms/{id}/usage -> not in use',
      run: async () => {
        const patched = await api.patch(`${API_PREFIX}/rooms/${ids.room}`, { session, body: { name: `Smoke ${tag} (changed)` } });
        expectStatus(patched, 200);
        expectEqual(bodyObject(patched)['name'], `Smoke ${tag} (changed)`, 'name');
        const usage = await api.get(`${API_PREFIX}/rooms/${ids.room}/usage`, { session });
        expectStatus(usage, 200);
        expectEqual(expectShape(usage.body, ROOM_USAGE_SHAPE, 'usage')['inUse'], false, 'inUse of a new room');
      },
    },
  ];
}

function serviceStep(suite: Suite, ids: Ids, tag: string): SmokeStep {
  const { api, sessions } = suite;
  const session = sessions.admin;
  return {
    name: 'POST /admin/services -> 201; PATCH -> 200',
    run: async () => {
      const body = { name: `Smoke ${tag}`, typeSystem: NSI_SERVICES, typeCode: '10001', defaultDurationMin: 30, description: 'created by the stack smoke' };
      const created = await api.post(`${API_PREFIX}/services`, { session, body });
      expectStatus(created, 201);
      ids.service = String(expectShape(created.body, SERVICE_SHAPE, 'service')['id']);
      const patched = await api.patch(`${API_PREFIX}/services/${ids.service}`, { session, body: { defaultDurationMin: 25 } });
      expectStatus(patched, 200);
      expectEqual(bodyObject(patched)['defaultDurationMin'], 25, 'defaultDurationMin');
    },
  };
}

/** The schedule of the new room and service, in a horizon no demo schedule uses. */
function scheduleBody(suite: Suite, ids: Ids, horizon: { horizonFrom: string; horizonTo: string } = HORIZON): object {
  return { practitionerRoleId: suite.accounts.doctorRoleId, roomId: ids.room, serviceId: ids.service, ...horizon, windows: SATURDAY, slotDurationMin: 30 };
}

function scheduleCrudSteps(suite: Suite, ids: Ids): SmokeStep[] {
  const { api, sessions, accounts } = suite;
  const session = sessions.admin;
  return [
    {
      name: 'POST /admin/schedules for the new room and service -> 201 (ids created through the API are accepted)',
      run: async () => {
        const response = await api.post(`${API_PREFIX}/schedules`, { session, body: scheduleBody(suite, ids) });
        expectStatus(response, 201);
        ids.schedule = String(expectShape(response.body, SCHEDULE_SHAPE, 'schedule')['id']);
      },
    },
    {
      name: 'GET /admin/schedules?doctorId=&active=true -> envelope containing it',
      run: async () => {
        const items = expectPage(await api.get(`${API_PREFIX}/schedules`, { session, query: { doctorId: accounts.doctorRoleId, active: true } }), SCHEDULE_SHAPE);
        expectTrue(items.some((item) => item['id'] === ids.schedule), 'the new schedule is not in the list');
      },
    },
    {
      name: 'PATCH /admin/schedules/{id} -> 200',
      run: async () => {
        const response = await api.patch(`${API_PREFIX}/schedules/${ids.schedule}`, { session, body: { comment: 'smoke', slotDurationMin: 30 } });
        expectStatus(response, 200);
        expectEqual(expectShape(response.body, SCHEDULE_SHAPE, 'schedule')['comment'], 'smoke', 'comment');
      },
    },
  ];
}

function slotSteps(suite: Suite, ids: Ids): SmokeStep[] {
  const { api, sessions } = suite;
  const session = sessions.admin;
  const key = newKey();
  const range = { from: HORIZON.horizonFrom, to: HORIZON.horizonTo };
  return [
    {
      name: 'POST /admin/schedules/{id}/generate with an Idempotency-Key -> 201 {generated, skipped}; the replay answers the same',
      run: async () => {
        const path = `${API_PREFIX}/schedules/${ids.schedule}/generate`;
        const first = await api.post(path, { session, body: range, headers: { 'Idempotency-Key': key } });
        expectStatus(first, 201);
        expectTrue(Number(expectShape(first.body, GENERATE_SHAPE, 'generate')['generated']) > 0, 'no slot was generated');
        const replay = await api.post(path, { session, body: range, headers: { 'Idempotency-Key': key } });
        expectStatus(replay, 201);
        expectEqual(replay.text, first.text, 'the replayed generate answer');
      },
    },
    {
      name: 'GET /admin/schedules/{id}/slots -> the generated slots',
      run: async () => {
        const response = await api.get(`${API_PREFIX}/schedules/${ids.schedule}/slots`, { session, query: range });
        expectStatus(response, 200);
        const slots = asArray(response.body, 'slots');
        expectTrue(slots.length > 0, 'the schedule has no slot');
        slots.forEach((slot) => expectShape(slot, SLOT_SHAPE, 'slot'));
      },
    },
  ];
}

/** BR-007: the horizon decides whether the same weekday window overlaps. */
function overlapSteps(suite: Suite, ids: Ids): SmokeStep[] {
  const { api, sessions } = suite;
  const session = sessions.admin;
  return [
    {
      name: 'POST /admin/schedules with the same weekday window and an overlapping horizon -> 409 SCHEDULE_OVERLAP',
      run: async () => {
        const body = scheduleBody(suite, ids, { horizonFrom: isoDay(65), horizonTo: isoDay(70) });
        expectProblem(await api.post(`${API_PREFIX}/schedules`, { session, body }), 409, 'SCHEDULE_OVERLAP');
      },
    },
    {
      name: 'POST /admin/schedules with the same weekday window in a later, disjoint horizon -> 201',
      run: async () => {
        const body = scheduleBody(suite, ids, { horizonFrom: isoDay(120), horizonTo: isoDay(130) });
        const response = await api.post(`${API_PREFIX}/schedules`, { session, body });
        expectStatus(response, 201);
        ids.futureSchedule = String(expectShape(response.body, SCHEDULE_SHAPE, 'schedule')['id']);
      },
    },
  ];
}

function inUseSteps(suite: Suite, ids: Ids): SmokeStep[] {
  const { api, sessions } = suite;
  const session = sessions.admin;
  return [
    {
      name: 'DELETE /admin/rooms/{id} while a schedule uses it -> 409 ROOM_IN_USE',
      run: async () => expectProblem(await api.delete(`${API_PREFIX}/rooms/${ids.room}`, { session }), 409, 'ROOM_IN_USE'),
    },
    {
      name: 'DELETE /admin/services/{id} while a schedule uses it -> 409 SERVICE_IN_USE',
      run: async () => expectProblem(await api.delete(`${API_PREFIX}/services/${ids.service}`, { session }), 409, 'SERVICE_IN_USE'),
    },
    {
      name: 'DELETE /admin/schedules/{id} {cascade:false} with slots -> 409 SCHEDULE_IN_USE',
      run: async () => {
        const response = await api.delete(`${API_PREFIX}/schedules/${ids.schedule}`, { session, body: { cascade: false } });
        expectProblem(response, 409, 'SCHEDULE_IN_USE');
      },
    },
  ];
}

function deleteScheduleSteps(suite: Suite, ids: Ids): SmokeStep[] {
  const { api, sessions } = suite;
  const session = sessions.admin;
  return [
    {
      name: 'DELETE /admin/schedules/{id} {cascade:true} -> 204 and its free slots are gone',
      run: async () => {
        const scheduleId = ids.schedule;
        expectStatus(await api.delete(`${API_PREFIX}/schedules/${scheduleId}`, { session, body: { cascade: true } }), 204);
        ids.schedule = '';
        const slots = await api.get(`${API_PREFIX}/schedules/${scheduleId}/slots`, { session, query: { from: HORIZON.horizonFrom, to: HORIZON.horizonTo } });
        expectEqual(asArray(slots.body, 'slots').length, 0, 'slots left after the cascade delete');
      },
    },
    {
      name: 'DELETE /admin/schedules/{id} of the second schedule -> 204',
      run: async () => {
        expectStatus(await api.delete(`${API_PREFIX}/schedules/${ids.futureSchedule}`, { session, body: { cascade: true } }), 204);
        ids.futureSchedule = '';
      },
    },
  ];
}

function deleteCatalogStep(suite: Suite, ids: Ids): SmokeStep {
  const { api, sessions } = suite;
  const session = sessions.admin;
  return {
    name: 'DELETE /admin/services/{id} and /admin/rooms/{id} -> 204 once nothing uses them',
    run: async () => {
      const { service } = ids;
      expectStatus(await api.delete(`${API_PREFIX}/services/${service}`, { session }), 204);
      ids.service = '';
      expectStatus(await api.delete(`${API_PREFIX}/rooms/${ids.room}`, { session }), 204);
      ids.room = '';
      expectProblem(await api.get(`/api/v1/services/${service}`), 404, 'NOT_FOUND');
    },
  };
}

/** Janitor for a chain that stopped half way: removes what the steps left behind, so a failed run leaves no test data. */
async function removeLeftovers(suite: Suite, ids: Ids): Promise<void> {
  const leftovers: Array<[string, string, unknown?]> = [
    [`${API_PREFIX}/schedules/${ids.schedule}`, ids.schedule, { cascade: true }],
    [`${API_PREFIX}/schedules/${ids.futureSchedule}`, ids.futureSchedule, { cascade: true }],
    [`${API_PREFIX}/services/${ids.service}`, ids.service],
    [`${API_PREFIX}/rooms/${ids.room}`, ids.room],
    [`${API_PREFIX}/rooms/${ids.otherRoom}`, ids.otherRoom],
  ];
  for (const [path, id, body] of leftovers.filter(([, id]) => id !== '')) {
    const response = await suite.api.delete(path, { session: suite.sessions.admin, ...(body === undefined ? {} : { body }) });
    if (response.status !== 204) {
      console.warn(`cleanup: DELETE ${path} answered HTTP ${response.status} (${id}); remove the test data by hand`);
    }
  }
}

/** The admin's catalog lifecycle in one chain: every step needs what the previous one made. */
export async function adminCatalogChecks(suite: Suite): Promise<void> {
  const ids: Ids = { room: '', otherRoom: '', service: '', schedule: '', futureSchedule: '' };
  await suite.runner.chain(GROUP, [
    ...roomSteps(suite, ids, runTag()),
    serviceStep(suite, ids, runTag()),
    ...scheduleCrudSteps(suite, ids),
    ...slotSteps(suite, ids),
    ...overlapSteps(suite, ids),
    ...inUseSteps(suite, ids),
    ...deleteScheduleSteps(suite, ids),
    deleteCatalogStep(suite, ids),
  ]);
  await removeLeftovers(suite, ids);
}
