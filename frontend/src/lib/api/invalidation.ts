import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { queryKeys, queryRoots } from './query-keys';

export type MutationKind =
  | 'booking'
  | 'cancel-appointment'
  | 'noshow'
  | 'open-encounter'
  | 'complete-encounter'
  | 'read-notification'
  | 'consent-change'
  | 'update-contact'
  | 'admin-users'
  | 'admin-services'
  | 'admin-rooms'
  | 'admin-schedules'
  | 'generate-slots'
  | 'terminology-import';

export const INVALIDATION: Readonly<Record<MutationKind, ReadonlyArray<QueryKey>>> = {
  booking: [queryRoots.slots, queryRoots.appointments, queryRoots.doctorAppointments, queryRoots.doctorSchedule, queryKeys.unreadCount],
  'cancel-appointment': [
    queryRoots.appointments,
    queryRoots.appointmentDetail,
    queryRoots.doctorAppointments,
    queryRoots.doctorSchedule,
    queryRoots.slots,
    queryKeys.unreadCount,
  ],
  noshow: [queryRoots.appointments, queryRoots.appointmentDetail, queryRoots.doctorAppointments, queryKeys.unreadCount],
  'open-encounter': [queryRoots.doctorAppointments, queryRoots.encounters],
  'complete-encounter': [
    queryRoots.encounters,
    queryRoots.history,
    queryRoots.prescriptions,
    queryRoots.doctorAppointments,
    queryRoots.appointments,
    queryRoots.appointmentDetail,
  ],
  'read-notification': [queryRoots.notifications],
  'consent-change': [queryRoots.consent],
  'update-contact': [queryKeys.patientProfile],
  'admin-users': [queryRoots.adminUsers, queryRoots.doctors],
  'admin-services': [queryRoots.services],
  'admin-rooms': [queryRoots.rooms, queryRoots.roomUsage],
  'admin-schedules': [queryRoots.adminSchedules, queryRoots.roomUsage, queryRoots.doctorSchedule],
  'generate-slots': [queryRoots.adminScheduleSlots, queryRoots.doctorSchedule, queryRoots.slots],
  'terminology-import': [queryRoots.valueSets],
};

export async function invalidateFor(client: QueryClient, kind: MutationKind): Promise<void> {
  await Promise.all(INVALIDATION[kind].map((queryKey) => client.invalidateQueries({ queryKey })));
}
