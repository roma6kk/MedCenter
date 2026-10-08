/**
 * error-code-map — the 17/17 errorCode → UX contract from frontend-design-spec §5.4.
 *
 * Pure data. Components decide how to render each `kind`; this module only pins which
 * UX each catalog code receives. `Record<ErrorCode, …>` makes a new or missing code a
 * compile error, so the catalog and the UX cannot drift apart.
 */
import type { ErrorCode } from './problem';

export type ErrorUx =
  | { kind: 'field-errors' }
  | { kind: 'silent-refresh' }
  | { kind: 'logout-toast'; message: string }
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  | { kind: 'banner-generic' }
  | { kind: 'slot-conflict' }
  | { kind: 'appointment-refresh' }
  | { kind: 'encounter-readonly' }
  | { kind: 'schedule-highlight' }
  | { kind: 'focus-icd10' }
  | { kind: 'focus-terminology' }
  | { kind: 'rate-limit-toast' }
  | { kind: 'internal-banner' };

export const errorCodeMap: Readonly<Record<ErrorCode, ErrorUx>> = {
  VALIDATION_ERROR: { kind: 'field-errors' },
  UNAUTHENTICATED: { kind: 'silent-refresh' },
  TOKEN_REVOKED: { kind: 'logout-toast', message: 'Сессия завершена, войдите снова' },
  FORBIDDEN_SCOPE: { kind: 'forbidden' },
  FORBIDDEN_ROLE: { kind: 'forbidden' },
  // BR-006: a foreign patient's resource must look identical to a missing one.
  COMPARTMENT_VIOLATION: { kind: 'not-found' },
  NOT_FOUND: { kind: 'not-found' },
  METHOD_NOT_ALLOWED: { kind: 'banner-generic' },
  CONFLICT: { kind: 'banner-generic' },
  SLOT_CONFLICT: { kind: 'slot-conflict' },
  APPOINTMENT_NOT_CANCELLABLE: { kind: 'appointment-refresh' },
  ENCOUNTER_STATE_INVALID: { kind: 'encounter-readonly' },
  SCHEDULE_OVERLAP: { kind: 'schedule-highlight' },
  INVALID_ICD10_CODE: { kind: 'focus-icd10' },
  TERMINOLOGY_NOT_FOUND: { kind: 'focus-terminology' },
  RATE_LIMITED: { kind: 'rate-limit-toast' },
  INTERNAL: { kind: 'internal-banner' },
};

export function errorCodeToUx(code: ErrorCode): ErrorUx {
  return errorCodeMap[code];
}
