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
  readonly details?: readonly FieldErrorDetail[];
}