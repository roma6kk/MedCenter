/**
 * consent-api — the calls of the consent endpoints, one function per endpoint (api-designer-spec §3.4–3.11, ADR-019).
 *
 * `/me/consent` is the patient's own (the patient comes from the token); `/patients/{id}/consent` is staff's (ADMIN, or a
 * DOCTOR linked to the patient, ADR-013).
 */
import { apiFetch } from '@/lib/api/api-fetch';
import type { ConsentRecord, CreateConsentBody, PatientConsent, RevokeConsentBody, ScanUpload } from './consent-types';

function patientPath(patientId: string): string {
  return `/api/v1/patients/${encodeURIComponent(patientId)}/consent`;
}

/** 3.4 */
export function fetchMyConsent(signal?: AbortSignal): Promise<PatientConsent> {
  return apiFetch<PatientConsent>('/api/v1/me/consent', { signal });
}

/** 3.6: the body is empty; blocks new records at once, deletes nothing. */
export function postMyConsentRevoke(): Promise<ConsentRecord> {
  return apiFetch<ConsentRecord>('/api/v1/me/consent/revoke', { method: 'POST' });
}

/** 3.7 (read by staff is audited on the server). */
export function fetchPatientConsent(patientId: string, signal?: AbortSignal): Promise<PatientConsent> {
  return apiFetch<PatientConsent>(patientPath(patientId), { signal });
}

/** 3.10: `multipart/form-data`, field `file`. */
export function postConsentScan(patientId: string, file: File): Promise<ScanUpload> {
  const form = new FormData();
  form.append('file', file, file.name);
  return apiFetch<ScanUpload>(`${patientPath(patientId)}/scan`, { method: 'POST', body: form });
}

/** 3.8 */
export function postPatientConsent(patientId: string, body: CreateConsentBody): Promise<ConsentRecord> {
  return apiFetch<ConsentRecord>(patientPath(patientId), { method: 'POST', body: JSON.stringify(body) });
}

/** 3.9 */
export function postPatientConsentRevoke(patientId: string, body: RevokeConsentBody): Promise<ConsentRecord> {
  return apiFetch<ConsentRecord>(`${patientPath(patientId)}/revoke`, { method: 'POST', body: JSON.stringify(body) });
}

/** 3.11: the bytes of the scan; every read is audited on the server. A plain link cannot carry the Bearer token. */
export function fetchConsentScan(patientId: string, scanId: string): Promise<Blob> {
  return apiFetch<Blob>(`${patientPath(patientId)}/scan/${encodeURIComponent(scanId)}`, { responseAs: 'blob' });
}
