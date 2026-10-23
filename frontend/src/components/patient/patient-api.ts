/**
 * patient-api — the patient's own reads: history (7.6), prescriptions (7.7), account (2.2.7) and FHIR profile (3.1), and the one write (3.12, the phone).
 *
 * Every path is `/me/*`: the patient comes from the token, so no call carries a patient id or a `patient` parameter
 * (BR-006, ADR-013).
 */
import { apiFetch } from '@/lib/api/api-fetch';
import type { PageParams, PaginatedResponse } from '@/lib/api/pagination';
import { withQuery } from '@/lib/api/query-string';
import type { AccountProfile, HistoryEntry, PatientProfile, Prescription } from './patient-types';

type ListParams = Pick<PageParams, 'page' | 'pageSize'>;

export function fetchMyHistory(params: ListParams): Promise<PaginatedResponse<HistoryEntry>> {
  return apiFetch<PaginatedResponse<HistoryEntry>>(withQuery('/api/v1/me/history', params));
}

export function fetchMyPrescriptions(params: ListParams): Promise<PaginatedResponse<Prescription>> {
  return apiFetch<PaginatedResponse<Prescription>>(withQuery('/api/v1/me/prescriptions', params));
}

export function fetchAccount(): Promise<AccountProfile> {
  return apiFetch<AccountProfile>('/api/v1/me');
}

export function fetchPatientProfile(): Promise<PatientProfile> {
  return apiFetch<PatientProfile>('/api/v1/me/patient');
}

export interface PhoneChange {
  /** `+375XXXXXXXXX`. */
  readonly phone: string;
  /** `version` of the card the change was made on; a newer stored card answers 409 `CONFLICT` (ADR-012). */
  readonly version: string;
}

/** 3.12 — the patient changes their own phone; the card is the answer. */
export function updateMyPhone({ phone, version }: PhoneChange): Promise<PatientProfile> {
  return apiFetch<PatientProfile>('/api/v1/me/patient', {
    method: 'PATCH',
    headers: { 'If-Match': `W/"${version}"` },
    body: JSON.stringify({ phone }),
  });
}
