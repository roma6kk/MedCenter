/**
 * Contract of the patient-consent endpoints (API §3.4–3.11, ADR-019). Plain
 * types: request validation lives in `patient-service` (class-validator), the
 * frontend keeps its own copy.
 */

/** Who signed the paper form: the patient or a person acting for them (Law «О здравоохранении», ст. 18 ч. 2). */
export const CONSENTER_TYPES = ['self', 'legal-representative', 'guardian', 'relative'] as const;
export type ConsenterType = (typeof CONSENTER_TYPES)[number];

/** `Consent.status` values a response can carry; `draft`/`proposed` are never written. */
export const CONSENT_STATUSES = ['active', 'inactive', 'rejected', 'entered-in-error'] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

/** Statuses a clerk may enter through 3.8: a signed consent or a written refusal. */
export const CONSENT_ENTRY_STATUSES = ['active', 'rejected'] as const;
export type ConsentEntryStatus = (typeof CONSENT_ENTRY_STATUSES)[number];

/** Scan of the paper form (3.10): PDF, JPEG or PNG up to 10 MB. */
export const CONSENT_SCAN_CONTENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export type ConsentScanContentType = (typeof CONSENT_SCAN_CONTENT_TYPES)[number];
export const CONSENT_SCAN_MAX_BYTES = 10 * 1024 * 1024;

/** 3.8 `POST /patients/{id}/consent` body. */
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

/** 3.9 `POST /patients/{id}/consent/revoke` body; 3.6 sends none. */
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

/** 3.4 / 3.7 answer: the consent in force (or `null`) and the whole history, newest first. */
export interface PatientConsentResponse {
  readonly active: ConsentResponse | null;
  readonly history: ReadonlyArray<ConsentResponse>;
}

/** 3.10 answer. */
export interface ConsentScanUploadResponse {
  readonly scanId: string;
  readonly contentType: string;
  readonly size: number;
  readonly hash: string;
}
