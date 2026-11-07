import type { AuditContext, WriteActor } from '@medcenter/fhir';

export const AUDIT_SOURCE = 'catalog-service';

export function auditOf(actor: WriteActor): AuditContext {
  return { actor, source: AUDIT_SOURCE };
}
