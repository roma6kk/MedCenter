// libs/contracts error-code.frontend-parity.spec.ts parses ERROR_CODES with a regex: keep it a plain list of quoted codes, one per line.
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
  'CONSENT_REQUIRED',
  'CONSENT_ALREADY_ACTIVE',
  'ACCOUNT_CONSENT_WITHDRAWN',
  'INVALID_PASSWORD',
  'ENCOUNTER_STATE_INVALID',
  'SCHEDULE_OVERLAP',
  'SCHEDULE_IN_USE',
  'ROOM_IN_USE',
  'SERVICE_IN_USE',
  'AGE_RESTRICTED',
  'INVALID_ICD10_CODE',
  'TERMINOLOGY_NOT_FOUND',
  'RATE_LIMITED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface FieldErrorDetail {
  readonly field: string;
  readonly message: string;
}

export interface ProblemDetails {
  readonly type?: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance?: string;
  readonly errorCode: ErrorCode;
  readonly requestId?: string;
  readonly details?: ReadonlyArray<FieldErrorDetail>;
  readonly retryAfter?: number;
}

export { errorCodeToUx, type ErrorUx } from './error-code-map';
