'use client';

/**
 * use-doctor-queries — TanStack Query reads of the doctor area. Keys come from the shared factory
 * (`lib/api/query-keys`, frontend-design-spec §5.1), lifetimes from `query-config`.
 */
import { keepPreviousData, useQuery, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { DEFAULT_STALE_TIME_MS, STALE_TIME_MS } from '@/lib/api/query-config';
import { queryKeys } from '@/lib/api/query-keys';
import { minskDayBounds } from './clinic-time';
import {
  CARD_PAGE_SIZE,
  EXPAND_COUNT,
  SUGGESTION_COUNT,
  fetchDoctorJournal,
  fetchDoctorSchedule,
  fetchEncounter,
  fetchExpansion,
  fetchPatient,
  fetchPatientHistory,
  fetchPatientPrescriptions,
  fetchRelatedPersons,
  type JournalRange,
} from './doctor-api';
import type {
  DoctorJournalPage,
  DoctorScheduleResponse,
  EncounterDetails,
  Expansion,
  HistoryItem,
  PatientCard,
  Prescription,
  RelatedPerson,
  Term,
} from './doctor-types';

/** A clinic day rarely has more than a few dozen visits; 50 keeps one day on one page so the status filter sees all of it. */
export const JOURNAL_PAGE_SIZE = 50;

/** Params object of a journal query key (`['doctorAppointments', { from, to, page, pageSize }]`), if it is one. */
function journalFrom(query: { readonly queryKey: ReadonlyArray<unknown> } | undefined): unknown {
  const params: unknown = query?.queryKey[1];
  return typeof params === 'object' && params !== null && 'from' in params ? (params as { from: unknown }).from : undefined;
}

/**
 * The doctor's own appointments of one clinic day (API 6.5), one server page at a time.
 * Turning the page keeps the old rows on screen meanwhile; switching the day does not (rows of another day would mislead).
 */
export function useDoctorJournal(dateKey: string, page: number): UseQueryResult<DoctorJournalPage> {
  const range: JournalRange = minskDayBounds(dateKey);
  return useQuery({
    queryKey: queryKeys.doctorAppointments({ ...range, page, pageSize: JOURNAL_PAGE_SIZE }),
    queryFn: ({ signal }) => fetchDoctorJournal(range, { page, pageSize: JOURNAL_PAGE_SIZE }, signal),
    staleTime: STALE_TIME_MS.appointments,
    placeholderData: (previous, previousQuery) => (journalFrom(previousQuery) === range.from ? previous : undefined),
  });
}

/** The doctor's schedules and their slots in the range (API 5.2.7); not cached long — a booking must show at once. */
export function useDoctorSchedule(range: JournalRange): UseQueryResult<DoctorScheduleResponse> {
  return useQuery({
    queryKey: queryKeys.doctorScheduleRange({ from: range.from, to: range.to }),
    queryFn: ({ signal }) => fetchDoctorSchedule(range, signal),
    staleTime: STALE_TIME_MS.slots,
  });
}

export function useEncounter(encounterId: string): UseQueryResult<EncounterDetails> {
  return useQuery({
    queryKey: queryKeys.encounterDetail(encounterId),
    queryFn: ({ signal }) => fetchEncounter(encounterId, signal),
    staleTime: DEFAULT_STALE_TIME_MS,
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

interface ExpansionOptions {
  /** Hold the request back (a search box waits for a few characters). */
  readonly enabled?: boolean;
  readonly count?: number;
}

/** A page of a ValueSet (API 2.3.2). Expansions only change on a terminology import, hence the 1 h lifetime. */
export function useExpansion(valueSet: string, filter: string, options: ExpansionOptions = {}): UseQueryResult<Expansion> {
  const count: number = options.count ?? EXPAND_COUNT;
  return useQuery({
    queryKey: [...queryKeys.terminologyExpand(valueSet, filter), count] as const,
    queryFn: ({ signal }) => fetchExpansion(valueSet, filter, count, signal),
    enabled: options.enabled ?? true,
    staleTime: STALE_TIME_MS.terminology,
  });
}

/**
 * The concept whose code is exactly `code` (API 2.3.2 searches by code and name), `null` when the value set has none.
 * Reads through the query cache with the key of a suggestion search, so a code the doctor just searched costs no request.
 */
export async function lookupTerm(client: QueryClient, valueSet: string, code: string): Promise<Term | null> {
  const expansion: Expansion = await client.fetchQuery({
    queryKey: [...queryKeys.terminologyExpand(valueSet, code), SUGGESTION_COUNT] as const,
    queryFn: ({ signal }) => fetchExpansion(valueSet, code, SUGGESTION_COUNT, signal),
    staleTime: STALE_TIME_MS.terminology,
  });
  return expansion.items.find((item) => item.code === code) ?? null;
}
