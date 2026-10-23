import { auditOf } from './checks-chain-async';
import type { Ids } from './checks-admin-catalog-ids';
import { expectEqual } from './smoke-assert';
import type { SmokeStep } from './smoke-runner';
import type { Suite } from './suite';

/** The audit journal (FR-021, ADR-014) records the admin's catalog writes, one event per write (the journal follows HAPI on an interval). */
export function auditSteps(suite: Suite, ids: Ids): SmokeStep[] {
  const actions = async (entity: string, action: string): Promise<number> => (await auditOf(suite, entity, action)).length;
  return [
    {
      name: 'GET /admin/audit?entity=Location/{id} -> the room create, update and delete',
      run: async () => {
        const room = `Location/${ids.removed.room}`;
        expectEqual(await actions(room, 'create'), 1, 'create events of the room');
        expectEqual(await actions(room, 'update'), 1, 'update events of the room');
        expectEqual(await actions(room, 'delete'), 1, 'delete events of the room');
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
