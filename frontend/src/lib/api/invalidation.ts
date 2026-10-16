/**
 * invalidation — which cached queries each mutation makes stale (frontend-design-spec §5.1 table).
 *
 * `invalidateFor(client, 'booking')` after `POST /appointments`, and so on. Keeping the table in one place means a
 * component never has to remember that a booking also changes the unread-notification counter.
 */
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { queryKeys, queryRoots } from './query-keys';

export type MutationKind =
  | 'booking'
  | 'cancel-appointment'
  | 'noshow'
  | 'open-encounter'
  | 'complete-encounter'
  | 'read-notification'
  | 'admin-users'
  | 'admin-services'
  | 'admin-rooms'
  | 'admin-schedules'
  | 'generate-slots'
  | 'terminology-import';

export const INVALIDATION: Readonly<Record<MutationKind, ReadonlyArray<QueryKey>>> = {
  booking: [queryRoots.slots, queryRoots.appointments, queryKeys.unreadCount],
  'cancel-appointment': [queryRoots.appointments, queryRoots.appointmentDetail, queryRoots.doctorAppointments, queryKeys.unreadCount, queryRoots.slots],
  noshow: [queryRoots.appointments, queryRoots.appointmentDetail, queryRoots.doctorAppointments, queryKeys.unreadCount],
  'open-encounter': [queryRoots.doctorAppointments, queryRoots.encounters],
  'complete-encounter': [queryRoots.encounters, queryRoots.history, queryRoots.prescriptions, queryRoots.doctorAppointments],
  'read-notification': [queryRoots.notifications],
  'admin-users': [queryRoots.adminUsers],
  'admin-services': [queryRoots.services],
  'admin-rooms': [queryRoots.rooms, queryRoots.roomUsage],
  'admin-schedules': [queryRoots.adminSchedules, queryRoots.roomUsage, queryRoots.doctorSchedule],
  'generate-slots': [queryRoots.adminScheduleSlots, queryRoots.doctorSchedule, queryRoots.slots],
  'terminology-import': [queryRoots.valueSets],
};

export async function invalidateFor(client: QueryClient, kind: MutationKind): Promise<void> {
  await Promise.all(INVALIDATION[kind].map((queryKey) => client.invalidateQueries({ queryKey })));
}
