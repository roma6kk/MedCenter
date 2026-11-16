import { clinicDayOf, isDateKey } from '@/lib/clinic-time';

type ConsentStatus = 'active' | 'inactive' | 'rejected' | 'entered-in-error';
export type ConsentEntryStatus = 'active' | 'rejected';
export type ConsenterType = 'self' | 'legal-representative' | 'guardian' | 'relative';

export interface ConsentScanRef {
  readonly id: string;
  readonly contentType: string;
  readonly hash: string;
}

export function consentDayOf(signedAt: string): string {
  return isDateKey(signedAt) ? signedAt : clinicDayOf(signedAt);
}

export interface ConsentRecord {
  readonly id: string;
  readonly status: ConsentStatus;
  readonly formNumber?: string;
  readonly signedAt: string;
  readonly consenterType?: ConsenterType;
  readonly performer: { readonly type: 'Patient' | 'RelatedPerson'; readonly id: string };
  readonly signedBy?: string;
  readonly representativeDocument?: string;
  readonly scan?: ConsentScanRef;
  readonly period: { readonly start?: string; readonly end?: string };
  readonly revocationNumber?: string;
  readonly recordedAt?: string;
}

export interface PatientConsent {
  readonly active: ConsentRecord | null;
  readonly history: ReadonlyArray<ConsentRecord>;
}

export interface ScanUpload {
  readonly scanId: string;
  readonly contentType: string;
  readonly size: number;
  readonly hash: string;
}

export interface CreateConsentBody {
  readonly status?: ConsentEntryStatus;
  readonly formNumber: string;
  readonly signedAt: string;
  readonly scanId: string;
  readonly consenterType: ConsenterType;
  readonly relatedPersonId?: string;
  readonly representativeDocument?: string;
  readonly signedByName?: string;
}

export interface RevokeConsentBody {
  readonly applicationNumber: string;
  readonly revokedAt?: string;
}

export interface ConsentEntry {
  readonly file: File;
  readonly body: Omit<CreateConsentBody, 'scanId'>;
}

export type ConsentState = 'active' | 'revoked' | 'rejected' | 'none';

export function consentStateOf(consent: PatientConsent): ConsentState {
  if (consent.active !== null) return 'active';
  const latest: ConsentRecord | undefined = consent.history.find((entry) => entry.status !== 'entered-in-error');
  if (latest?.status === 'inactive') return 'revoked';
  if (latest?.status === 'rejected') return 'rejected';
  return 'none';
}
