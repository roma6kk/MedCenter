import type { ErrorCode } from './error-code';

export interface FieldErrorDetail {
  readonly field: string;
  readonly message: string;
}

export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance: string;
  readonly requestId: string;
  readonly errorCode: ErrorCode;
  /** `VALIDATION_ERROR` only: one entry per violated constraint (API §1). */
  readonly details?: readonly FieldErrorDetail[];
}