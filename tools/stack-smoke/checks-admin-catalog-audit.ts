import { auditOf } from './checks-chain-async';
import type { Ids } from './checks-admin-catalog-ids';
import { bodyObject, expectEqual, expectPage, expectProblem, expectShape, expectTrue } from './smoke-assert';
import { ROOM_SHAPE } from './smoke-shapes';
import type { SmokeStep } from './smoke-runner';
import type { Suite } from './suite';

const API_PREFIX = '/api/v1/admin';

/** API §4.4: two parallel creates of one free identifier -> exactly one 201 and one 409 CONFLICT (the read check alone cannot see the other request). */
export function concurrentRoomStep(suite: Suite, ids: Ids, tag: string): SmokeStep {
  const { api, sessions } = suite;
  const session = sessions.admin;
  return {
    name: 'two concurrent POST /admin/rooms with one free identifier -> exactly one 201 and one 409 CONFLICT naming it',
    run: async () => {
      const identifier = `smoke-${tag}-race`;
      const create = (name: string): ReturnType<typeof api.post> => api.post(`${API_PREFIX}/rooms`, { session, body: { identifier, name } });
      const attempts = await Promise.all([create(`Smoke ${tag} race a`), create(`Smoke ${tag} race b`)]);
      const created = attempts.filter((attempt) => attempt.status === 201);
      const refused = attempts.filter((attempt) => attempt.status === 409);
      expectEqual(created.length, 1, 'number of 201 answers');
      expectEqual(refused.length, 1, 'number of 409 answers');
      const winner = created[0];
      const loser = refused[0];
      if (winner === undefined || loser === undefined) {
        throw new Error('the race did not end in one 201 and one 409');
      }
      ids.raceRoom = String(expectShape(winner.body, ROOM_SHAPE, 'room')['id']);
      expectProblem(loser, 409, 'CONFLICT');
      expectTrue(String(bodyObject(loser)['detail']).includes(identifier), 'the 409 detail does not name the identifier');
      const stored = expectPage(await api.get('/api/v1/rooms', { session, query: { pageSize: 100 } }), ROOM_SHAPE);
      expectEqual(stored.filter((room) => room['identifier'] === identifier).length, 1, 'rooms stored with the raced identifier');
    },
  };
}

/** The audit journal (FR-021, ADR-014) records the admin's catalog writes, one event per write (the journal follows HAPI on an interval). */
export function auditSteps(suite: Suite, ids: Ids): SmokeStep[] {
  const actions = async (entity: string, action: string): Promise<number> => (await auditOf(suite, entity, action)).length;
  return [
    {
      name: 'GET /admin/audit?entity=Location/{id} -> the room create, update and delete; the raced room has exactly one create',
      run: async () => {
        const room = `Location/${ids.removed.room}`;
        expectEqual(await actions(room, 'create'), 1, 'create events of the room');
        expectEqual(await actions(room, 'update'), 1, 'update events of the room');
        expectEqual(await actions(room, 'delete'), 1, 'delete events of the room');
        expectEqual(await actions(`Location/${ids.raceRoom}`, 'create'), 1, 'create events of the raced room (the lost create writes none)');
      },
    },
    {
      name: 'GET /admin/audit?entity=HealthcareService/{id} and Schedule/{id} -> the service create, update, delete and the schedule create, update, delete',
      run: async () => {
        const service = `HealthcareService/${ids.removed.service}`;
        const schedule = `Schedule/${ids.removed.schedule}`;
        for (const action of ['create', 'update', 'delete']) {
          expectEqual(await actions(service, action), 1, `${action} events of the service`);
          expectEqual(await actions(schedule, action), 1, `${action} events of the schedule`);
        }
      },
    },
  ];
}
