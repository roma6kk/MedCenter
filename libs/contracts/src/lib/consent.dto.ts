export const CONSENTER_TYPES = ['self', 'legal-representative', 'guardian', 'relative'] as const;
export type ConsenterType = (typeof CONSENTER_TYPES)[number];

export const CONSENT_STATUSES = ['active', 'inactive', 'rejected', 'entered-in-error'] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export const CONSENT_ENTRY_STATUSES = ['active', 'rejected'] as const;
export type ConsentEntryStatus = (typeof CONSENT_ENTRY_STATUSES)[number];

export const CONSENT_SCAN_CONTENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export type ConsentScanContentType = (typeof CONSENT_SCAN_CONTENT_TYPES)[number];
export const CONSENT_SCAN_MAX_BYTES = 10 * 1024 * 1024;

export interface CreateConsentRequest {
  readonly status?: ConsentEntryStatus;
  readonly formNumber: string;
  readonly signedAt: string;
  readonly scanId: string;
  readonly consenterType: ConsenterType;
  readonly relatedPersonId?: string;
  readonly representativeDocument?: string;
  readonly signedByName?: string;
}

export interface RevokeConsentRequest {
  readonly applicationNumber: string;
  readonly revokedAt?: string;
}

export interface ConsentScanRef {
  readonly id: string;
  readonly contentType: string;
  readonly hash: string;
}

export interface ConsentResponse {
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

export interface PatientConsentResponse {
  readonly active: ConsentResponse | null;
  readonly history: ReadonlyArray<ConsentResponse>;
  /** Only in the staff read (3.7): false when the patient is under 18, so the form offers no `self` signer. */
  readonly patientIsAdult?: boolean;
}

export interface ConsentScanUploadResponse {
  readonly scanId: string;
  readonly contentType: string;
  readonly size: number;
  readonly hash: string;
}
