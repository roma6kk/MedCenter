export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'TOKEN_REVOKED',
  'FORBIDDEN_SCOPE',
  'FORBIDDEN_ROLE',
  'COMPARTMENT_VIOLATION',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'CONFLICT',
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

export { errorCodeToUx, type ErrorUx } from './error-code-map';
