import { apiFetch } from '@/lib/api/api-fetch';
import type { ConsentRecord, CreateConsentBody, PatientConsent, RevokeConsentBody, ScanUpload } from './consent-types';

function patientPath(patientId: string): string {
  return `/api/v1/patients/${encodeURIComponent(patientId)}/consent`;
}

export function fetchMyConsent(signal?: AbortSignal): Promise<PatientConsent> {
  return apiFetch<PatientConsent>('/api/v1/me/consent', { signal });
}

export function postMyConsentRevoke(): Promise<ConsentRecord> {
  return apiFetch<ConsentRecord>('/api/v1/me/consent/revoke', { method: 'POST' });
}

export function fetchPatientConsent(patientId: string, signal?: AbortSignal): Promise<PatientConsent> {
  return apiFetch<PatientConsent>(patientPath(patientId), { signal });
}

export function postConsentScan(patientId: string, file: File): Promise<ScanUpload> {
  const form = new FormData();
  form.append('file', file, file.name);
  return apiFetch<ScanUpload>(`${patientPath(patientId)}/scan`, { method: 'POST', body: form });
}

export function postPatientConsent(patientId: string, body: CreateConsentBody): Promise<ConsentRecord> {
  return apiFetch<ConsentRecord>(patientPath(patientId), { method: 'POST', body: JSON.stringify(body) });
}

export function postPatientConsentRevoke(patientId: string, body: RevokeConsentBody): Promise<ConsentRecord> {
  return apiFetch<ConsentRecord>(`${patientPath(patientId)}/revoke`, { method: 'POST', body: JSON.stringify(body) });
}

// Every read is audited on the server; a plain link cannot carry the Bearer token.
export function fetchConsentScan(patientId: string, scanId: string): Promise<Blob> {
  return apiFetch<Blob>(`${patientPath(patientId)}/scan/${encodeURIComponent(scanId)}`, { responseAs: 'blob' });
}
