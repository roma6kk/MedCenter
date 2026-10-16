/**
 * query-keys — TanStack Query key factory (frontend-design-spec §5.1: `[domain, ...identity, params]`).
 *
 * The first element is always the domain, so `invalidateQueries({ queryKey: ['slots'] })` hits every slot
 * query regardless of doctor or date range. Params are normalised to an object (never `undefined`) so
 * `queryKeys.services()` and `queryKeys.services({})` are the same key.
 */
import type { QueryKey } from '@tanstack/react-query';
import type { QueryParams } from './query-string';

type Params = QueryParams | undefined;

function normalise(params: Params): QueryParams {
  return params ?? {};
}

export const queryKeys = {
  // catalogue (public, cached 5 min)
  services: (params?: Params) => ['services', normalise(params)] as const,
  doctors: (params?: Params) => ['doctors', normalise(params)] as const,
  doctor: (doctorId: string) => ['doctors', doctorId] as const,
  rooms: (params?: Params) => ['rooms', normalise(params)] as const,
  roomUsage: (roomId: string) => ['roomUsage', roomId] as const,
  slots: (doctorId: string, params?: Params) => ['slots', doctorId, normalise(params)] as const,

  // patient
  appointments: (params?: Params) => ['appointments', normalise(params)] as const,
  appointmentDetail: (appointmentId: string) => ['appointment', appointmentId] as const,
  history: (patientId: string = 'me', params?: Params) => ['patientHistory', patientId, normalise(params)] as const,
  prescriptions: (patientId: string = 'me', params?: Params) => ['prescriptions', patientId, normalise(params)] as const,
  profile: ['profile'] as const,

  // notifications (patient)
  notifications: (params?: Params) => ['notifications', 'list', normalise(params)] as const,
  unreadCount: ['notifications', 'unreadCount'] as const,

  // doctor
  doctorAppointments: (params?: Params) => ['doctorAppointments', normalise(params)] as const,
  doctorSchedule: ['doctorSchedule'] as const,
  doctorScheduleRange: (params?: Params) => ['doctorSchedule', normalise(params)] as const,
  /** The doctor's view of a patient: card (API 3.2) and trusted persons (3.3). History/prescriptions reuse the keys above. */
  patientCard: (patientId: string) => ['patientCard', patientId] as const,
  relatedPersons: (patientId: string, params?: Params) => ['relatedPersons', patientId, normalise(params)] as const,
  encounterDetail: (encounterId: string) => ['encounter', encounterId] as const,

  // terminology (cached 1 h)
  valueSets: (system?: string) => (system === undefined ? (['valueSets'] as const) : (['valueSets', system] as const)),
  terminologyExpand: (system: string, filter: string) => ['valueSets', system, 'expand', filter] as const,

  // admin
  adminUsers: (params?: Params) => ['adminUsers', normalise(params)] as const,
  adminSchedules: (params?: Params) => ['adminSchedules', normalise(params)] as const,
  adminScheduleSlots: (scheduleId: string, params?: Params) => ['adminScheduleSlots', scheduleId, normalise(params)] as const,
  analytics: (kind: string, params?: Params) => ['analytics', kind, normalise(params)] as const,
  audit: (params?: Params) => ['audit', normalise(params)] as const,
} as const;

/** Prefix keys for invalidation: every query of the domain, whatever its identity and params. */
export const queryRoots = {
  services: ['services'],
  doctors: ['doctors'],
  rooms: ['rooms'],
  roomUsage: ['roomUsage'],
  slots: ['slots'],
  appointments: ['appointments'],
  appointmentDetail: ['appointment'],
  history: ['patientHistory'],
  prescriptions: ['prescriptions'],
  notifications: ['notifications'],
  doctorAppointments: ['doctorAppointments'],
  doctorSchedule: ['doctorSchedule'],
  encounters: ['encounter'],
  valueSets: ['valueSets'],
  adminUsers: ['adminUsers'],
  adminSchedules: ['adminSchedules'],
  adminScheduleSlots: ['adminScheduleSlots'],
} as const satisfies Readonly<Record<string, QueryKey>>;
