export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'TOKEN_REVOKED',
  'FORBIDDEN_SCOPE',
  'FORBIDDEN_ROLE',
  'COMPARTMENT_VIOLATION',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'SLOT_CONFLICT',
  'APPOINTMENT_NOT_CANCELLABLE',
  'ENCOUNTER_STATE_INVALID',
  'SCHEDULE_OVERLAP',
  'INVALID_ICD10_CODE',
  'TERMINOLOGY_NOT_FOUND',
  'RATE_LIMITED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ProblemDetails {
  readonly type?: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly errorCode: ErrorCode;
  readonly requestId?: string;
  readonly details?: ReadonlyArray<{ field: string; message: string }>;
  readonly retryAfter?: number;
}

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

const MAP: Record<ErrorCode, ErrorUx> = {
  VALIDATION_ERROR: { kind: 'field-errors' },
  UNAUTHENTICATED: { kind: 'silent-refresh' },
  TOKEN_REVOKED: { kind: 'logout-toast', message: 'Сессия завершена, войдите снова' },
  FORBIDDEN_SCOPE: { kind: 'forbidden' },
  FORBIDDEN_ROLE: { kind: 'forbidden' },
  COMPARTMENT_VIOLATION: { kind: 'not-found' },
  NOT_FOUND: { kind: 'not-found' },
  METHOD_NOT_ALLOWED: { kind: 'banner-generic' },
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
  return MAP[code];
}
