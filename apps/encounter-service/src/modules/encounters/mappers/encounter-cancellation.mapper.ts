import type { FhirResource } from '@medcenter/fhir';

import { buildAuditEvent } from '../../../common/audit/audit-event';
import { versionOf, type TransactionWrite } from '../../../common/fhir/fhir-transaction';
import { appointmentIdOf } from './encounter-view.mapper';
import { unflaggedAppointment } from './encounter-opening.mapper';

interface CancellationContext {
  readonly encounter: FhirResource;
  readonly encounterId: string;
  readonly appointment: FhirResource;
  readonly patientRef: string;
  readonly actorSub: string;
  readonly requestId?: string;
}

interface CancellationPlan {
  readonly writes: readonly TransactionWrite[];
  readonly cancelledEncounter: FhirResource;
}

export function buildCancellationWrites(context: CancellationContext): CancellationPlan {
  const cancelledEncounter: FhirResource = { ...context.encounter, status: 'cancelled' };
  const appointmentId = appointmentIdOf(context.encounter);
  const audit = (entityRef: string): TransactionWrite => ({
    method: 'POST',
    url: 'AuditEvent',
    resource: buildAuditEvent({
      action: 'U',
      subtype: 'update',
      actorSub: context.actorSub,
      entityRefs: [entityRef],
      patientRef: context.patientRef,
      requestId: context.requestId,
    }),
  });
  return {
    cancelledEncounter,
    // Dropping the "opened" flag changes the Appointment version, so a concurrent no-show or cancel loses the If-Match race, and a later reopening changes it again.
    writes: [
      { method: 'PUT', url: `Encounter/${context.encounterId}`, resource: cancelledEncounter, ifMatch: versionOf(context.encounter) },
      { method: 'PUT', url: `Appointment/${appointmentId}`, resource: unflaggedAppointment(context.appointment), ifMatch: versionOf(context.appointment) },
      audit(`Encounter/${context.encounterId}`),
      audit(`Appointment/${appointmentId}`),
    ],
  };
}
