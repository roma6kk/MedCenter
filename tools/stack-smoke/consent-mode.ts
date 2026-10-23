import type { ApiResponse } from './smoke-types';

/** `CONSENT_ENFORCEMENT` of the services (ADR-019): `block` refuses with 409, `warn` only logs. */
export type EnforcementMode = 'warn' | 'block';

/**
 * Reads the mode from what a booking with a free-text reason does for a patient without consent
 * (API 6.1): `block` answers 409 `CONSENT_REQUIRED`, `warn` books without the reason (2xx).
 */
export function modeFromAnswer(response: Pick<ApiResponse, 'status' | 'body'>): EnforcementMode {
  const errorCode = (response.body as { errorCode?: unknown } | undefined)?.errorCode;
  if (response.status === 409 && errorCode === 'CONSENT_REQUIRED') {
    return 'block';
  }
  if (response.status >= 200 && response.status < 300) {
    return 'warn';
  }
  throw new Error(`cannot tell CONSENT_ENFORCEMENT from HTTP ${response.status}${typeof errorCode === 'string' ? ` ${errorCode}` : ''}`);
}

/** The detected mode, checked against `SMOKE_CONSENT_ENFORCEMENT` when that is set: a wrong declaration must not pass quietly. */
export function reconcileMode(configured: EnforcementMode | undefined, detected: EnforcementMode): EnforcementMode {
  if (configured !== undefined && configured !== detected) {
    throw new Error(`SMOKE_CONSENT_ENFORCEMENT=${configured}, but the stack behaves as ${detected}`);
  }
  return detected;
}
