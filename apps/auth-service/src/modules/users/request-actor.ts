import { claimsOf, type RequestWithClaims } from '@medcenter/common';

import type { AuditActor } from '../audit/audit-event.builder';

/** A request that passed `JwtAuthGuard` and `RequestIdMiddleware`. */
export interface AuthenticatedRequest extends RequestWithClaims {
  readonly requestId?: string;
}

/** The token `sub` plus the correlation id, for the `AuditEvent` of a mutation. */
export function actorOf(request: AuthenticatedRequest): AuditActor {
  const claims = claimsOf(request);
  return { sub: claims.sub, ...(request.requestId !== undefined ? { requestId: request.requestId } : {}) };
}
