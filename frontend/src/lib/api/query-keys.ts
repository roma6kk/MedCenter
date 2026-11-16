import type { QueryKey } from '@tanstack/react-query';
import type { Locale } from '@/lib/i18n/locale';
import { useUiStore } from '@/store/use-ui-store';
import type { QueryParams } from './query-string';

type Params = QueryParams | undefined;

function normalise(params: Params): QueryParams {
  return params ?? {};
}

function locale(): Locale {
  return useUiStore.getState().locale;
}

export const queryKeys = {
  services: (params?: Params) => ['services', normalise(params), locale()] as const,
  adminServices: (params?: Params) => ['services', { ...normalise(params), admin: true }, locale()] as const,
  doctors: (params?: Params) => ['doctors', normalise(params), locale()] as const,
  doctor: (doctorId: string) => ['doctors', doctorId, locale()] as const,
  rooms: (params?: Params) => ['rooms', normalise(params)] as const,
  roomUsage: (roomId: string) => ['roomUsage', roomId] as const,
  slots: (doctorId: string, params?: Params) => ['slots', doctorId, normalise(params)] as const,

  appointments: (params?: Params) => ['appointments', normalise(params), locale()] as const,
  appointmentDetail: (appointmentId: string) => ['appointment', appointmentId, locale()] as const,
  history: (patientId: string = 'me', params?: Params) => ['patientHistory', patientId, normalise(params)] as const,
  prescriptions: (patientId: string = 'me', params?: Params) => ['prescriptions', patientId, normalise(params)] as const,
  profile: ['profile'] as const,
  patientProfile: ['profile', 'patient'] as const,

  myConsent: ['consent', 'me'] as const,
  patientConsent: (patientId: string) => ['consent', 'patient', patientId] as const,

  notifications: (params?: Params) => ['notifications', 'list', normalise(params)] as const,
  unreadCount: ['notifications', 'unreadCount'] as const,

  doctorAppointments: (params?: Params) => ['doctorAppointments', normalise(params), locale()] as const,
  doctorSchedule: ['doctorSchedule'] as const,
  doctorScheduleRange: (params?: Params) => ['doctorSchedule', normalise(params), locale()] as const,
  patientCard: (patientId: string) => ['patientCard', patientId] as const,
  relatedPersons: (patientId: string, params?: Params) => ['relatedPersons', patientId, normalise(params)] as const,
  encounterDetail: (encounterId: string) => ['encounter', encounterId] as const,

  valueSets: (system?: string) => (system === undefined ? (['valueSets'] as const) : (['valueSets', system] as const)),
  terminologyExpand: (system: string, filter: string) => ['valueSets', system, 'expand', filter] as const,

  adminUsers: (params?: Params) => ['adminUsers', normalise(params)] as const,
  adminAppointments: (params?: Params) => ['adminAppointments', normalise(params), locale()] as const,
  adminSchedules: (params?: Params) => ['adminSchedules', normalise(params)] as const,
  adminScheduleSlots: (scheduleId: string, params?: Params) => ['adminScheduleSlots', scheduleId, normalise(params)] as const,
  analytics: (kind: string, params?: Params) => ['analytics', kind, normalise(params), locale()] as const,
  audit: (params?: Params) => ['audit', normalise(params)] as const,
} as const;

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
  consent: ['consent'],
  doctorAppointments: ['doctorAppointments'],
  doctorSchedule: ['doctorSchedule'],
  encounters: ['encounter'],
  valueSets: ['valueSets'],
  adminUsers: ['adminUsers'],
  adminAppointments: ['adminAppointments'],
  adminSchedules: ['adminSchedules'],
  adminScheduleSlots: ['adminScheduleSlots'],
} as const satisfies Readonly<Record<string, QueryKey>>;
