import type { ApiResponse } from './smoke-types';

export type EnforcementMode = 'warn' | 'block';

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

export function reconcileMode(configured: EnforcementMode | undefined, detected: EnforcementMode): EnforcementMode {
  if (configured !== undefined && configured !== detected) {
    throw new Error(`SMOKE_CONSENT_ENFORCEMENT=${configured}, but the stack behaves as ${detected}`);
  }
  return detected;
}
