import type { ErrorCode } from './problem';

export type InUseResource = 'room' | 'service' | 'schedule';

export type ErrorUx =
  | { kind: 'field-errors' }
  | { kind: 'silent-refresh' }
  | { kind: 'logout-toast' }
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  | { kind: 'banner-generic' }
  | { kind: 'consent-required' }
  | { kind: 'consent-active' }
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
  COMPARTMENT_VIOLATION: { kind: 'not-found' },
  NOT_FOUND: { kind: 'not-found' },
  METHOD_NOT_ALLOWED: { kind: 'banner-generic' },
  CONFLICT: { kind: 'banner-generic' },
  SLOT_CONFLICT: { kind: 'slot-conflict' },
  APPOINTMENT_NOT_CANCELLABLE: { kind: 'appointment-refresh' },
  CONSENT_REQUIRED: { kind: 'consent-required' },
  CONSENT_ALREADY_ACTIVE: { kind: 'consent-active' },
  ACCOUNT_CONSENT_WITHDRAWN: { kind: 'banner-generic' },
  INVALID_PASSWORD: { kind: 'banner-generic' },
  ENCOUNTER_STATE_INVALID: { kind: 'encounter-readonly' },
  SCHEDULE_OVERLAP: { kind: 'schedule-highlight' },
  SCHEDULE_IN_USE: { kind: 'in-use-conflict', resource: 'schedule' },
  ROOM_IN_USE: { kind: 'in-use-conflict', resource: 'room' },
  SERVICE_IN_USE: { kind: 'in-use-conflict', resource: 'service' },
  AGE_RESTRICTED: { kind: 'banner-generic' },
  INVALID_ICD10_CODE: { kind: 'focus-icd10' },
  TERMINOLOGY_NOT_FOUND: { kind: 'focus-terminology' },
  RATE_LIMITED: { kind: 'rate-limit-toast' },
  INTERNAL: { kind: 'internal-banner' },
};

const FALLBACK_UX: ErrorUx = { kind: 'banner-generic' };

export function errorCodeToUx(code: ErrorCode): ErrorUx {
  return errorCodeMap[code] ?? FALLBACK_UX;
}

export function errorMessageKey(code: ErrorCode): string {
  return `errors.${code}`;
}

export function isToastUx(ux: ErrorUx): boolean {
  return ux.kind === 'logout-toast' || ux.kind === 'rate-limit-toast' || ux.kind === 'slot-conflict';
}
