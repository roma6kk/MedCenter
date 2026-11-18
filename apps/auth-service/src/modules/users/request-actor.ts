import { claimsOf, type RequestWithClaims } from '@medcenter/common';

import type { AuditActor } from '../audit/audit-event.builder';

export interface AuthenticatedRequest extends RequestWithClaims {
  readonly requestId?: string;
}

export function actorOf(request: AuthenticatedRequest): AuditActor {
  const claims = claimsOf(request);
  return { sub: claims.sub, ...(request.requestId !== undefined ? { requestId: request.requestId } : {}) };
}
