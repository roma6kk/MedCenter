/**
 * consent-types — the answers and bodies of the consent endpoints (api-designer-spec §3.4–3.11, ADR-019), as the
 * services send them. `libs/contracts` `consent.dto.ts` is the server's copy; the optional fields are omitted, not `null`.
 */

export type ConsentStatus = 'active' | 'inactive' | 'rejected' | 'entered-in-error';
/** Statuses a clerk may enter: a signed consent or a written refusal. */
export type ConsentEntryStatus = 'active' | 'rejected';
export type ConsenterType = 'self' | 'legal-representative' | 'guardian' | 'relative';

export const CONSENTER_TYPES: ReadonlyArray<ConsenterType> = ['self', 'legal-representative', 'guardian', 'relative'];

export interface ConsentScanRef {
  readonly id: string;
  readonly contentType: string;
  readonly hash: string;
}

export interface ConsentRecord {
  readonly id: string;
  readonly status: ConsentStatus;
  readonly formNumber?: string;
  /** `YYYY-MM-DD` or RFC 3339. */
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

/** 3.4 / 3.7: the consent in force (or `null`) and the whole history, newest first. */
export interface PatientConsent {
  readonly active: ConsentRecord | null;
  readonly history: ReadonlyArray<ConsentRecord>;
}

/** 3.10 answer. */
export interface ScanUpload {
  readonly scanId: string;
  readonly contentType: string;
  readonly size: number;
  readonly hash: string;
}

/** 3.8 body; `scanId` comes from the upload (3.10). */
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

/** 3.9 body. */
export interface RevokeConsentBody {
  readonly applicationNumber: string;
  readonly revokedAt?: string;
}

/** What the clerk's form hands to the recording: the 3.8 body without the scan id, and the scan file itself. */
export interface ConsentEntry {
  readonly file: File;
  readonly body: Omit<CreateConsentBody, 'scanId'>;
}

/** The overall picture of a patient's consent that screens branch on. */
export type ConsentState = 'active' | 'revoked' | 'rejected' | 'none';

/** `active` when a consent is in force; otherwise what the newest entry of the history says (`none` for an empty one). */
export function consentStateOf(consent: PatientConsent): ConsentState {
  if (consent.active !== null) return 'active';
  const latest: ConsentRecord | undefined = consent.history.find((entry) => entry.status !== 'entered-in-error');
  if (latest?.status === 'inactive') return 'revoked';
  if (latest?.status === 'rejected') return 'rejected';
  return 'none';
}
