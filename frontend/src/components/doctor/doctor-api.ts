/**
 * doctor-api — the HTTP calls of the doctor area, one function per endpoint (api-designer-spec §3, §5.2.7, §6.5–6.6, §7).
 *
 * Paths and bodies are exactly what the services accept; list endpoints answer the `{ items, meta }` envelope.
 */
import { apiFetch } from '@/lib/api/api-fetch';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { withQuery } from '@/lib/api/query-string';
import type {
  DoctorJournalPage,
  DoctorScheduleResponse,
  EncounterDetails,
  EncounterSummary,
  Expansion,
  HistoryItem,
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

export function fetchDoctorJournal(range: JournalRange, request: PageRequest, signal?: AbortSignal): Promise<DoctorJournalPage> {
  const path = withQuery('/api/v1/doctor/appointments', { from: range.from, to: range.to, page: request.page, pageSize: request.pageSize, sortOrder: 'asc' });
  return apiFetch<DoctorJournalPage>(path, { signal });
}

export function postNoshow(appointmentId: string): Promise<unknown> {
  return apiFetch(`/api/v1/doctor/appointments/${encodeURIComponent(appointmentId)}/noshow`, { method: 'POST' });
}

/** API 7.1: 201 for a new encounter, 200 with the open one when the appointment already has it. */
export function postOpenEncounter(appointmentId: string): Promise<EncounterSummary> {
  return apiFetch<EncounterSummary>('/api/v1/encounters', { method: 'POST', body: JSON.stringify({ appointmentId }) });
}

export function fetchEncounter(encounterId: string, signal?: AbortSignal): Promise<EncounterDetails> {
  return apiFetch<EncounterDetails>(`/api/v1/encounters/${encodeURIComponent(encounterId)}`, { signal });
}

/** API 7.3: one atomic body; a replay answers `409 ENCOUNTER_STATE_INVALID`. */
export function postCompleteEncounter(encounterId: string, body: CompleteEncounterForm): Promise<EncounterSummary> {
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

export function fetchPatientPrescriptions(patientId: string, request: PageRequest, signal?: AbortSignal): Promise<PaginatedResponse<Prescription>> {
  const path = withQuery(`/api/v1/patients/${encodeURIComponent(patientId)}/prescriptions`, { page: request.page, pageSize: request.pageSize });
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
