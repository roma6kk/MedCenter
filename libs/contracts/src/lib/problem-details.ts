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
  /**
   * One entry per violated constraint (API §1): `VALIDATION_ERROR`, and the 422
   * `INVALID_ICD10_CODE` / `TERMINOLOGY_NOT_FOUND` of `POST /encounters/{id}/complete`
   * (`field` is the request path of the offending code, e.g. `diagnoses.0.code`).
   */
  readonly details?: readonly FieldErrorDetail[];
}