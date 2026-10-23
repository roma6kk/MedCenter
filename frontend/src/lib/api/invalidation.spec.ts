import { QueryClient } from '@tanstack/react-query';
import { INVALIDATION, invalidateFor, type MutationKind } from './invalidation';
import { queryKeys } from './query-keys';

function seededClient(): QueryClient {
  const client = new QueryClient();
  client.setQueryData(queryKeys.slots('d1'), []);
  client.setQueryData(queryKeys.appointments(), { items: [] });
  client.setQueryData(queryKeys.appointmentDetail('a1'), {});
  client.setQueryData(queryKeys.doctorAppointments(), { items: [] });
  client.setQueryData(queryKeys.unreadCount, 1);
  client.setQueryData(queryKeys.encounterDetail('e1'), {});
  client.setQueryData(queryKeys.history('p1'), { items: [] });
  client.setQueryData(queryKeys.prescriptions('p1'), { items: [] });
  client.setQueryData(queryKeys.valueSets('x'), []);
  client.setQueryData(queryKeys.profile, {});
  return client;
}

function invalidatedKeys(client: QueryClient): ReadonlyArray<string> {
  return client
    .getQueryCache()
    .getAll()
    .filter((query) => query.state.isInvalidated)
    .map((query) => String(query.queryKey[0]) + (query.queryKey[1] === 'unreadCount' ? '.unreadCount' : ''))
    .sort();
}

describe('invalidateFor', () => {
  it('should refresh slots, appointments and the unread counter after a booking (§5.1)', async () => {
    const client = seededClient();

    await invalidateFor(client, 'booking');

    expect(invalidatedKeys(client)).toEqual(['appointments', 'doctorAppointments', 'notifications.unreadCount', 'slots']);
  });

  it('should refresh the appointment views and the counter after a cancellation', async () => {
    const client = seededClient();

    await invalidateFor(client, 'cancel-appointment');

    expect(invalidatedKeys(client)).toEqual(expect.arrayContaining(['appointment', 'appointments', 'doctorAppointments', 'notifications.unreadCount']));
  });

  it('should refresh the encounter, the history and the prescriptions after complete (§5.1)', async () => {
    const client = seededClient();

    await invalidateFor(client, 'complete-encounter');

    expect(invalidatedKeys(client)).toEqual(expect.arrayContaining(['appointments', 'doctorAppointments', 'encounter', 'patientHistory', 'prescriptions']));
  });

  it('should refresh the patient card after the patient edits their phone', async () => {
    const client = seededClient();
    client.setQueryData(queryKeys.patientProfile, {});

    await invalidateFor(client, 'update-contact');

    expect(INVALIDATION['update-contact']).toEqual([queryKeys.patientProfile]);
    expect(client.getQueryState(queryKeys.patientProfile)?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.profile)?.isInvalidated).toBe(false);
  });

  it('should leave unrelated queries fresh', async () => {
    const client = seededClient();

    await invalidateFor(client, 'terminology-import');

    expect(invalidatedKeys(client)).toEqual(['valueSets']);
  });

  it('should define a non-empty rule for every mutation kind', () => {
    (Object.keys(INVALIDATION) as MutationKind[]).forEach((kind) => expect(INVALIDATION[kind].length).toBeGreaterThan(0));
  });
});
