'use client';

import { keepPreviousData, useQueries, useQuery, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { DEFAULT_STALE_TIME_MS, STALE_TIME_MS } from '@/lib/api/query-config';
import { queryKeys } from '@/lib/api/query-keys';
import { clinicDateKey, clinicDayBounds, shiftDateKey } from '@/lib/clinic-time';
import {
  CARD_PAGE_SIZE,
  EXPAND_COUNT,
  SUGGESTION_COUNT,
  fetchDoctorJournal,
  fetchDoctorSchedule,
  fetchEncounter,
  fetchExpansion,
  fetchJournalScan,
  fetchPatient,
  fetchPatientHistory,
  fetchPatientPrescriptions,
  fetchRelatedPersons,
  type JournalRange,
  type JournalScan,
} from './doctor-api';
import { patientsOf, type PatientHit } from './patient-search-model';
import type {
  DoctorJournalPage,
  DoctorScheduleResponse,
  EncounterDetails,
  Expansion,
  HistoryItem,
  JournalAppointment,
  PatientCard,
  Prescription,
  RelatedPerson,
  Term,
} from './doctor-types';

export const JOURNAL_PAGE_SIZE = 50;

function journalFrom(query: { readonly queryKey: ReadonlyArray<unknown> } | undefined): unknown {
  const params: unknown = query?.queryKey[1];
  return typeof params === 'object' && params !== null && 'from' in params ? (params as { from: unknown }).from : undefined;
}

export function useDoctorJournal(dateKey: string, page: number): UseQueryResult<DoctorJournalPage> {
  const range: JournalRange = clinicDayBounds(dateKey);
  return useQuery({
    queryKey: queryKeys.doctorAppointments({ ...range, page, pageSize: JOURNAL_PAGE_SIZE }),
    queryFn: ({ signal }) => fetchDoctorJournal(range, { page, pageSize: JOURNAL_PAGE_SIZE }, signal),
    staleTime: STALE_TIME_MS.appointments,
    placeholderData: (previous, previousQuery) => (journalFrom(previousQuery) === range.from ? previous : undefined),
  });
}

export function useDoctorWeekJournal(dateKeys: ReadonlyArray<string>): ReadonlyArray<UseQueryResult<DoctorJournalPage>> {
  return useQueries({
    queries: dateKeys.map((dateKey) => {
      const range: JournalRange = clinicDayBounds(dateKey);
      return {
        queryKey: queryKeys.doctorAppointments({ ...range, page: 1, pageSize: JOURNAL_PAGE_SIZE }),
        queryFn: ({ signal }: { readonly signal: AbortSignal }) => fetchDoctorJournal(range, { page: 1, pageSize: JOURNAL_PAGE_SIZE }, signal),
        staleTime: STALE_TIME_MS.appointments,
      };
    }),
  });
}

export function useDoctorSchedule(range: JournalRange): UseQueryResult<DoctorScheduleResponse> {
  return useQuery({
    queryKey: queryKeys.doctorScheduleRange({ from: range.from, to: range.to }),
    queryFn: ({ signal }) => fetchDoctorSchedule(range, signal),
    staleTime: STALE_TIME_MS.slots,
  });
}

export function useDoctorWeekAppointments(weekStart: string): UseQueryResult<DoctorJournalPage> {
  const range: JournalRange = { from: clinicDayBounds(weekStart).from, to: clinicDayBounds(shiftDateKey(weekStart, 6)).to };
  return useQuery({
    queryKey: queryKeys.doctorAppointments({ ...range, page: 1, pageSize: 100 }),
    queryFn: ({ signal }) => fetchDoctorJournal(range, { page: 1, pageSize: 100 }, signal),
    staleTime: STALE_TIME_MS.appointments,
  });
}

export function useEncounter(encounterId: string, enabled: boolean = true): UseQueryResult<EncounterDetails> {
  return useQuery({
    queryKey: queryKeys.encounterDetail(encounterId),
    queryFn: ({ signal }) => fetchEncounter(encounterId, signal),
    staleTime: DEFAULT_STALE_TIME_MS,
    enabled,
  });
}

export const UPCOMING_HORIZON_DAYS = 30;

export function useUpcomingVisit(patientId: string, excludeAppointmentId?: string): UseQueryResult<JournalAppointment | null> {
  const today: string = clinicDateKey();
  const range: JournalRange = { from: clinicDayBounds(today).from, to: clinicDayBounds(shiftDateKey(today, UPCOMING_HORIZON_DAYS)).to };
  const isUpcoming = (visit: JournalAppointment): boolean => visit.patientId === patientId && visit.status === 'booked' && visit.id !== excludeAppointmentId;
  return useQuery({
    queryKey: queryKeys.doctorAppointments({ ...range, scan: 'upcoming', patientId, exclude: excludeAppointmentId }),
    queryFn: async ({ signal }) => (await fetchJournalScan(range, { until: (items) => items.some(isUpcoming) }, signal)).items.find(isUpcoming) ?? null,
    staleTime: STALE_TIME_MS.appointments,
  });
}

export function usePatient(patientId: string): UseQueryResult<PatientCard> {
  return useQuery({
    queryKey: queryKeys.patientCard(patientId),
    queryFn: ({ signal }) => fetchPatient(patientId, signal),
    staleTime: DEFAULT_STALE_TIME_MS,
  });
}

export function useRelatedPersons(patientId: string, page: number): UseQueryResult<PaginatedResponse<RelatedPerson>> {
  return useQuery({
    queryKey: queryKeys.relatedPersons(patientId, { page, pageSize: CARD_PAGE_SIZE }),
    queryFn: ({ signal }) => fetchRelatedPersons(patientId, { page, pageSize: CARD_PAGE_SIZE }, signal),
    staleTime: DEFAULT_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });
}

export function usePatientHistory(patientId: string, page: number): UseQueryResult<PaginatedResponse<HistoryItem>> {
  return useQuery({
    queryKey: queryKeys.history(patientId, { page, pageSize: CARD_PAGE_SIZE }),
    queryFn: ({ signal }) => fetchPatientHistory(patientId, { page, pageSize: CARD_PAGE_SIZE }, signal),
    staleTime: DEFAULT_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });
}

export function usePatientPrescriptions(patientId: string, page: number): UseQueryResult<PaginatedResponse<Prescription>> {
  return useQuery({
    queryKey: queryKeys.prescriptions(patientId, { page, pageSize: CARD_PAGE_SIZE }),
    queryFn: ({ signal }) => fetchPatientPrescriptions(patientId, { page, pageSize: CARD_PAGE_SIZE }, signal),
    staleTime: DEFAULT_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });
}

const VISIT_ORDERS_PAGE_SIZE = 100;

export function useVisitPrescriptions(patientId: string, encounterId: string): UseQueryResult<PaginatedResponse<Prescription>> {
  return useQuery({
    queryKey: queryKeys.prescriptions(patientId, { page: 1, pageSize: VISIT_ORDERS_PAGE_SIZE, encounterId }),
    queryFn: ({ signal }) => fetchPatientPrescriptions(patientId, { page: 1, pageSize: VISIT_ORDERS_PAGE_SIZE, encounterId }, signal),
    staleTime: DEFAULT_STALE_TIME_MS,
  });
}

interface ExpansionOptions {
  readonly enabled?: boolean;
  readonly count?: number;
}

export function useExpansion(valueSet: string, filter: string, options: ExpansionOptions = {}): UseQueryResult<Expansion> {
  const count: number = options.count ?? EXPAND_COUNT;
  return useQuery({
    queryKey: [...queryKeys.terminologyExpand(valueSet, filter), count] as const,
    queryFn: ({ signal }) => fetchExpansion(valueSet, filter, count, signal),
    enabled: options.enabled ?? true,
    staleTime: STALE_TIME_MS.terminology,
  });
}

export async function lookupTerm(client: QueryClient, valueSet: string, code: string): Promise<Term | null> {
  const expansion: Expansion = await client.fetchQuery({
    queryKey: [...queryKeys.terminologyExpand(valueSet, code), SUGGESTION_COUNT] as const,
    queryFn: ({ signal }) => fetchExpansion(valueSet, code, SUGGESTION_COUNT, signal),
    staleTime: STALE_TIME_MS.terminology,
  });
  return expansion.items.find((item) => item.code === code) ?? null;
}

export const PATIENT_SEARCH_BACK_DAYS = 90;
export const PATIENT_SEARCH_AHEAD_DAYS = 30;
export const JOURNAL_MAX_PAGE_SIZE = 100;

export interface DoctorPatients {
  readonly patients: ReadonlyArray<PatientHit>;
  readonly truncated: boolean;
}

export function useDoctorPatients(enabled: boolean): UseQueryResult<DoctorPatients> {
  const today: string = clinicDateKey();
  const range: JournalRange = {
    from: clinicDayBounds(shiftDateKey(today, -PATIENT_SEARCH_BACK_DAYS)).from,
    to: clinicDayBounds(shiftDateKey(today, PATIENT_SEARCH_AHEAD_DAYS)).to,
  };
  return useQuery({
    queryKey: queryKeys.doctorAppointments({ ...range, scan: 'patients', sortOrder: 'desc' }),
    queryFn: async ({ signal }): Promise<JournalScan> => fetchJournalScan(range, { sortOrder: 'desc' }, signal),
    staleTime: STALE_TIME_MS.appointments,
    enabled,
    select: (scan): DoctorPatients => ({ patients: patientsOf(scan.items), truncated: scan.truncated }),
  });
}

export const NEXT_VISIT_LOOKAHEAD_DAYS = 14;

export function useNextBookedVisit(afterDay: string, today: string, enabled: boolean): UseQueryResult<JournalAppointment | null> {
  const first: string = shiftDateKey(afterDay, 1) > today ? shiftDateKey(afterDay, 1) : today;
  const range: JournalRange = { from: clinicDayBounds(first).from, to: clinicDayBounds(shiftDateKey(first, NEXT_VISIT_LOOKAHEAD_DAYS - 1)).to };
  return useQuery({
    queryKey: queryKeys.doctorAppointments({ ...range, page: 1, pageSize: JOURNAL_MAX_PAGE_SIZE }),
    queryFn: ({ signal }) => fetchDoctorJournal(range, { page: 1, pageSize: JOURNAL_MAX_PAGE_SIZE }, signal),
    staleTime: STALE_TIME_MS.appointments,
    enabled,
    select: (page) => [...page.items].filter((visit) => visit.status === 'booked').sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0] ?? null,
  });
}
