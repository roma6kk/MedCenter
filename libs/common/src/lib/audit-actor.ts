import { claimsOf } from './patient-compartment';
import type { RequestWithClaims } from './request-context';
import type { RequestWithRequestId } from './request-id.middleware';

export type AuditedRequest = RequestWithClaims & Pick<RequestWithRequestId, 'requestId'>;

export function auditActorOf(request: AuditedRequest): { readonly sub: string; readonly requestId?: string } {
  return { sub: claimsOf(request).sub, requestId: request.requestId };
}
