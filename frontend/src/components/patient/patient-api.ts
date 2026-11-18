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
  readonly phone: string;
  readonly version: string;
}

export function updateMyPhone({ phone, version }: PhoneChange): Promise<PatientProfile> {
  return apiFetch<PatientProfile>('/api/v1/me/patient', {
    method: 'PATCH',
    headers: { 'If-Match': `W/"${version}"` },
    body: JSON.stringify({ phone }),
  });
}

export function closeMyAccount(password: string): Promise<void> {
  return apiFetch<void>('/api/v1/me/deactivate', { method: 'POST', body: JSON.stringify({ password }) });
}

export function changeMyPassword(currentPassword: string, newPassword: string): Promise<void> {
  return apiFetch<void>('/api/v1/me/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
}
