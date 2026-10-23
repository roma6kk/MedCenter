import { buildEmergencyBypassAuditEvent } from '@medcenter/fhir';

import type { TransactionWrite } from '../../common/fhir/fhir-transaction';

/** The emergency-bypass AuditEvent rides in the clinical transaction: no bypass without its journal entry (ADR-019). */
export function emergencyBypassWrite(
  actorSub: string,
  patientRef: string,
  contextRef: string,
  reason: string | undefined,
  requestId?: string,
): TransactionWrite {
  return {
    method: 'POST',
    url: 'AuditEvent',
    resource: buildEmergencyBypassAuditEvent({
      actorSub,
      patientRef,
      reason: reason ?? '',
      contextRef,
      source: 'encounter-service',
      requestId,
    }),
  };
}
