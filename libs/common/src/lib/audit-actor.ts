import { claimsOf } from './patient-compartment';
import type { RequestWithClaims } from './request-context';
import type { RequestWithRequestId } from './request-id.middleware';

/** An authenticated request after `RequestIdMiddleware` has assigned its correlation id. */
export type AuditedRequest = RequestWithClaims & Pick<RequestWithRequestId, 'requestId'>;

/** Who is behind a write and through which request: the token `sub` and `X-Request-Id` the audit journal keys on (FR-021, NFR-007). */
export function auditActorOf(request: AuditedRequest): { readonly sub: string; readonly requestId?: string } {
  return { sub: claimsOf(request).sub, requestId: request.requestId };
}
