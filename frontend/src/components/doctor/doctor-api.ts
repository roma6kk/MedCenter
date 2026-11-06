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

export const CARD_PAGE_SIZE = 10;
export const EXPAND_COUNT = 100;
export const SUGGESTION_COUNT = 20;

export interface JournalRange {
  readonly from: string;
  readonly to: string;
}

export interface PageRequest {
  readonly page: number;
  readonly pageSize: number;
}

interface JournalPageRequest extends PageRequest {
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

export const JOURNAL_SCAN_MAX_PAGES = 10;

export interface JournalScan {
  readonly items: ReadonlyArray<JournalAppointment>;
  readonly truncated: boolean;
}

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

export function postOpenEncounter(appointmentId: string, emergencyReason?: string): Promise<EncounterSummary> {
  const body = emergencyReason === undefined ? { appointmentId } : { appointmentId, emergencyReason };
  return apiFetch<EncounterSummary>('/api/v1/encounters', { method: 'POST', body: JSON.stringify(body) });
}

export function fetchEncounter(encounterId: string, signal?: AbortSignal): Promise<EncounterDetails> {
  return apiFetch<EncounterDetails>(`/api/v1/encounters/${encodeURIComponent(encounterId)}`, { signal });
}

export type CompleteEncounterBody = CompleteEncounterForm & { readonly emergencyReason?: string };

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

export function fetchPatientPrescriptions(patientId: string, request: PageRequest & { readonly encounterId?: string }, signal?: AbortSignal): Promise<PaginatedResponse<Prescription>> {
  const path = withQuery(`/api/v1/patients/${encodeURIComponent(patientId)}/prescriptions`, { page: request.page, pageSize: request.pageSize, encounterId: request.encounterId });
  return apiFetch<PaginatedResponse<Prescription>>(path, { signal });
}

export function fetchDoctorSchedule(range: JournalRange, signal?: AbortSignal): Promise<DoctorScheduleResponse> {
  return apiFetch<DoctorScheduleResponse>(withQuery('/api/v1/doctor/schedule', { from: range.from, to: range.to }), { signal });
}

export function fetchExpansion(valueSet: string, filter: string, count: number = EXPAND_COUNT, signal?: AbortSignal): Promise<Expansion> {
  const path = withQuery('/api/v1/terminology/expand', { system: valueSet, filter, count });
  return apiFetch<Expansion>(path, { signal });
}
