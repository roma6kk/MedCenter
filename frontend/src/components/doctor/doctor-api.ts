/**
 * doctor-api — the HTTP calls of the doctor area, one function per endpoint (api-designer-spec §3, §5.2.7, §6.5–6.6, §7).
 *
 * Paths and bodies are exactly what the services accept; list endpoints answer the `{ items, meta }` envelope.
 */
import { apiFetch } from '@/lib/api/api-fetch';
import type { PaginatedResponse, SortOrder } from '@/lib/api/pagination';
import { withQuery } from '@/lib/api/query-string';
import type {
  DoctorJournalPage,
  DoctorScheduleResponse,
  EncounterDetails,
  EncounterSummary,
  Expansion,
  HistoryItem,
  JournalAppointment,
  PatientCard,
  Prescription,
  RelatedPerson,
} from './doctor-types';
import type { CompleteEncounterForm } from '@/lib/contracts';

export const ICD10_VALUE_SET = 'https://fhir.by/ValueSet/InternClassificDiseases10';
export const ATC_VALUE_SET = 'https://fhir.by/ValueSet/atc';
export const UCUM_VALUE_SET = 'https://fhir.by/ValueSet/ucum-units';
export const SERVICES_VALUE_SET = 'https://fhir.by/ValueSet/nsi-services';
export const OBSERVATIONS_VALUE_SET = 'https://fhir.by/ValueSet/nsi-observations';

/** One page of every list; the patient card pages through history and prescriptions with `page`. */
export const CARD_PAGE_SIZE = 10;
/** `$expand` pages are capped at 100 concepts by the service. */
export const EXPAND_COUNT = 100;
/** Suggestions of a search-as-you-type field; the same count keys the cache entry a later exact-code lookup reuses. */
export const SUGGESTION_COUNT = 20;

export interface JournalRange {
  readonly from: string;
  readonly to: string;
}

export interface PageRequest {
  readonly page: number;
  readonly pageSize: number;
}

export interface JournalPageRequest extends PageRequest {
  /** Oldest first by default. */
  readonly sortOrder?: SortOrder;
}

export function fetchDoctorJournal(range: JournalRange, request: JournalPageRequest, signal?: AbortSignal): Promise<DoctorJournalPage> {
  const path = withQuery('/api/v1/doctor/appointments', {
    from: range.from,
    to: range.to,
    page: request.page,
    pageSize: request.pageSize,
    sortOrder: request.sortOrder ?? 'asc',
  });
  return apiFetch<DoctorJournalPage>(path, { signal });
}

/** The journal pages a scan of a wide range reads at most (100 rows each): the search and the next-visit lookup stop here. */
export const JOURNAL_SCAN_MAX_PAGES = 10;

export interface JournalScan {
  readonly items: ReadonlyArray<JournalAppointment>;
  /** The page cap was reached while the journal has more pages: `items` is not the whole range. */
  readonly truncated: boolean;
}

/**
 * Reads the journal of a wide range page after page (largest page, up to `JOURNAL_SCAN_MAX_PAGES`, bounded by the real
 * `meta.totalPages`) and merges the rows. `until` ends the walk early once a page has what the caller needs.
 */
export async function fetchJournalScan(
  range: JournalRange,
  options: { readonly sortOrder?: SortOrder; readonly until?: (items: ReadonlyArray<JournalAppointment>) => boolean },
  signal?: AbortSignal,
): Promise<JournalScan> {
  const items: JournalAppointment[] = [];
  for (let page = 1; page <= JOURNAL_SCAN_MAX_PAGES; page += 1) {
    const result: DoctorJournalPage = await fetchDoctorJournal(range, { page, pageSize: 100, sortOrder: options.sortOrder }, signal);
    items.push(...result.items);
    if (options.until?.(result.items) === true) return { items, truncated: false };
    if (page >= result.meta.totalPages) return { items, truncated: false };
  }
  return { items, truncated: true };
}

export function postNoshow(appointmentId: string): Promise<unknown> {
  return apiFetch(`/api/v1/doctor/appointments/${encodeURIComponent(appointmentId)}/noshow`, { method: 'POST' });
}

/** API 7.1: 201 for a new encounter, 200 with the open one when the appointment already has it. `emergencyReason` (10…500) bypasses a missing consent (ADR-019). */
export function postOpenEncounter(appointmentId: string, emergencyReason?: string): Promise<EncounterSummary> {
  const body = emergencyReason === undefined ? { appointmentId } : { appointmentId, emergencyReason };
  return apiFetch<EncounterSummary>('/api/v1/encounters', { method: 'POST', body: JSON.stringify(body) });
}

export function fetchEncounter(encounterId: string, signal?: AbortSignal): Promise<EncounterDetails> {
  return apiFetch<EncounterDetails>(`/api/v1/encounters/${encodeURIComponent(encounterId)}`, { signal });
}

/** The completion form plus the optional `emergencyReason` (10…500) that bypasses a missing consent (ADR-019). */
export type CompleteEncounterBody = CompleteEncounterForm & { readonly emergencyReason?: string };

/** API 7.3: one atomic body; a replay answers `409 ENCOUNTER_STATE_INVALID`. */
export function postCompleteEncounter(encounterId: string, body: CompleteEncounterBody): Promise<EncounterSummary> {
  return apiFetch<EncounterSummary>(`/api/v1/encounters/${encodeURIComponent(encounterId)}/complete`, { method: 'POST', body: JSON.stringify(body) });
}

export function fetchPatient(patientId: string, signal?: AbortSignal): Promise<PatientCard> {
  return apiFetch<PatientCard>(`/api/v1/patients/${encodeURIComponent(patientId)}`, { signal });
}

export function fetchRelatedPersons(patientId: string, request: PageRequest, signal?: AbortSignal): Promise<PaginatedResponse<RelatedPerson>> {
  const path = withQuery(`/api/v1/patients/${encodeURIComponent(patientId)}/related`, { page: request.page, pageSize: request.pageSize });
  return apiFetch<PaginatedResponse<RelatedPerson>>(path, { signal });
}

export function fetchPatientHistory(patientId: string, request: PageRequest, signal?: AbortSignal): Promise<PaginatedResponse<HistoryItem>> {
  const path = withQuery(`/api/v1/patients/${encodeURIComponent(patientId)}/history`, { page: request.page, pageSize: request.pageSize });
  return apiFetch<PaginatedResponse<HistoryItem>>(path, { signal });
}

/** `encounterId` (optional) asks for the orders of one visit only (API 7.5), so a visit never depends on which page of the patient's orders it landed on. */
export function fetchPatientPrescriptions(patientId: string, request: PageRequest & { readonly encounterId?: string }, signal?: AbortSignal): Promise<PaginatedResponse<Prescription>> {
  const path = withQuery(`/api/v1/patients/${encodeURIComponent(patientId)}/prescriptions`, { page: request.page, pageSize: request.pageSize, encounterId: request.encounterId });
  return apiFetch<PaginatedResponse<Prescription>>(path, { signal });
}

export function fetchDoctorSchedule(range: JournalRange, signal?: AbortSignal): Promise<DoctorScheduleResponse> {
  return apiFetch<DoctorScheduleResponse>(withQuery('/api/v1/doctor/schedule', { from: range.from, to: range.to }), { signal });
}

/** API 2.3.2 in the form the client calls: `?system=<ValueSet canonical>`; `filter` searches code and display. */
export function fetchExpansion(valueSet: string, filter: string, count: number = EXPAND_COUNT, signal?: AbortSignal): Promise<Expansion> {
  const path = withQuery('/api/v1/terminology/expand', { system: valueSet, filter, count });
  return apiFetch<Expansion>(path, { signal });
}
