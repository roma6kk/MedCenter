/**
 * error-code-map — the 22/22 errorCode → UX contract from frontend-design-spec §5.4.
 *
 * Pure data. Components decide how to render each `kind`; this module only pins which UX each catalogue code
 * receives. `Record<ErrorCode, …>` makes a new or missing code a compile error, so the catalogue
 * (`libs/contracts` ERROR_CODES) and the UX cannot drift apart. Texts are not stored here: they come from
 * `messages/*.json` under `errors.<errorCode>` (see `errorMessageKey`).
 */
import type { ErrorCode } from './problem';

export type InUseResource = 'room' | 'service' | 'schedule';

export type ErrorUx =
  | { kind: 'field-errors' }
  | { kind: 'silent-refresh' }
  | { kind: 'logout-toast' }
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  | { kind: 'banner-generic' }
  | { kind: 'slot-conflict' }
  | { kind: 'appointment-refresh' }
  | { kind: 'encounter-readonly' }
  | { kind: 'schedule-highlight' }
  | { kind: 'in-use-conflict'; resource: InUseResource }
  | { kind: 'focus-icd10' }
  | { kind: 'focus-terminology' }
  | { kind: 'rate-limit-toast' }
  | { kind: 'internal-banner' };

export const errorCodeMap: Readonly<Record<ErrorCode, ErrorUx>> = {
  VALIDATION_ERROR: { kind: 'field-errors' },
  UNAUTHENTICATED: { kind: 'silent-refresh' },
  TOKEN_REVOKED: { kind: 'logout-toast' },
  FORBIDDEN_SCOPE: { kind: 'forbidden' },
  FORBIDDEN_ROLE: { kind: 'forbidden' },
  // BR-006: a foreign patient's resource must look identical to a missing one (the backend answers 403).
  COMPARTMENT_VIOLATION: { kind: 'not-found' },
  NOT_FOUND: { kind: 'not-found' },
  METHOD_NOT_ALLOWED: { kind: 'banner-generic' },
  CONFLICT: { kind: 'banner-generic' },
  SLOT_CONFLICT: { kind: 'slot-conflict' },
  APPOINTMENT_NOT_CANCELLABLE: { kind: 'appointment-refresh' },
  // ADR-019: the screens that raise these get their own handling in a later stage; until then the generic banner.
  CONSENT_REQUIRED: { kind: 'banner-generic' },
  CONSENT_ALREADY_ACTIVE: { kind: 'banner-generic' },
  ENCOUNTER_STATE_INVALID: { kind: 'encounter-readonly' },
  SCHEDULE_OVERLAP: { kind: 'schedule-highlight' },
  SCHEDULE_IN_USE: { kind: 'in-use-conflict', resource: 'schedule' },
  ROOM_IN_USE: { kind: 'in-use-conflict', resource: 'room' },
  SERVICE_IN_USE: { kind: 'in-use-conflict', resource: 'service' },
  INVALID_ICD10_CODE: { kind: 'focus-icd10' },
  TERMINOLOGY_NOT_FOUND: { kind: 'focus-terminology' },
  RATE_LIMITED: { kind: 'rate-limit-toast' },
  INTERNAL: { kind: 'internal-banner' },
};

const FALLBACK_UX: ErrorUx = { kind: 'banner-generic' };

/** A code the client does not know yet (newer backend) degrades to the generic banner instead of crashing. */
export function errorCodeToUx(code: ErrorCode): ErrorUx {
  return errorCodeMap[code] ?? FALLBACK_UX;
}

/** Message key of the localized text for a code, e.g. `errors.SLOT_CONFLICT`. */
export function errorMessageKey(code: ErrorCode): string {
  return `errors.${code}`;
}

/** Kinds the user should see as a toast (aria-live) rather than as an inline banner. */
export function isToastUx(ux: ErrorUx): boolean {
  return ux.kind === 'logout-toast' || ux.kind === 'rate-limit-toast' || ux.kind === 'slot-conflict';
}
