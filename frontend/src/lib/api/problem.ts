/**
 * problem — RFC 7807 `application/problem+json` as the BFF services send it (api-designer-spec §1).
 *
 * The client keeps its own copy of the `libs/contracts` ERROR_CODES catalogue (`frontend/` has no path to
 * `libs/`). `libs/contracts/.../error-code.frontend-parity.spec.ts` parses the array literal below with a regex, so keep
 * it a plain list of quoted codes, one per line, and do not repeat the declaration text in a comment.
 */
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
  'SCHEDULE_IN_USE',
  'ROOM_IN_USE',
  'SERVICE_IN_USE',
  'INVALID_ICD10_CODE',
  'TERMINOLOGY_NOT_FOUND',
  'RATE_LIMITED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** One violated constraint of a `VALIDATION_ERROR` (`details[]`); a field can carry several. */
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
  /** Seconds to wait, from the `Retry-After` header of a 429 (or the body when the service sends it there). */
  readonly retryAfter?: number;
}

export { errorCodeToUx, type ErrorUx } from './error-code-map';
