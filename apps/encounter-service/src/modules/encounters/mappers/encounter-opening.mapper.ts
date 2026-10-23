import type { FhirResource } from '@medcenter/fhir';

import { auditEventByEntityNameQuery, buildAuditEvent } from '../../../common/audit/audit-event';
import { arrayField, isRecord } from '../../../common/fhir/fhir-read';
import type { TransactionWrite } from '../../../common/fhir/fhir-transaction';

export interface OpeningContext {
  readonly appointmentId: string;
  readonly appointment: FhirResource;
  readonly patientRef: string;
  readonly practitionerRoleRef: string;
  /** `HealthcareService.type[0]` of the booked service, when known. */
  readonly serviceType?: Readonly<Record<string, unknown>>;
  readonly actorSub: string;
  /** `X-Request-Id` of the opening request, recorded in the AuditEvent. */
  readonly requestId?: string;
  readonly now: string;
  /** `urn:uuid:` of the new Encounter inside the bundle. */
  readonly fullUrl: string;
}

const AMBULATORY = {
  system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  code: 'AMB',
  display: 'ambulatory',
} as const;

const ATTENDER = {
  coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'ATND', display: 'attender' }],
} as const;

/** `HealthcareService.type[0]` — R4 `Encounter.serviceType` is a single CodeableConcept. */
export function serviceTypeOf(service: FhirResource): Readonly<Record<string, unknown>> | undefined {
  const type = arrayField(service, 'type')[0];
  return isRecord(type) ? type : undefined;
}

/** `ifNoneExist` query of the one-encounter-per-appointment rule. */
export function encounterOfAppointmentQuery(appointmentId: string): string {
  return `appointment=Appointment/${appointmentId}`;
}

/** Key of the opening's AuditEvent: one encounter per appointment means one opening event per appointment. */
export function openingAuditName(appointmentId: string): string {
  return `encounter-opened:Appointment/${appointmentId}`;
}

/** Key of the emergency-bypass AuditEvent of the opening. */
export function openingBypassName(appointmentId: string): string {
  return `encounter-emergency-open:Appointment/${appointmentId}`;
}

/** The new ambulatory encounter (FR-010): in progress, for the booked appointment, attended by the doctor. */
export function openedEncounterResource(context: OpeningContext): FhirResource {
  const reasonCode = arrayField(context.appointment, 'reasonCode');
  return {
    resourceType: 'Encounter',
    status: 'in-progress',
    class: AMBULATORY,
    ...(context.serviceType === undefined ? {} : { serviceType: context.serviceType }),
    subject: { reference: context.patientRef },
    participant: [{ type: [ATTENDER], individual: { reference: context.practitionerRoleRef } }],
    appointment: [{ reference: `Appointment/${context.appointmentId}` }],
    period: { start: context.now },
    ...(reasonCode.length === 0 ? {} : { reasonCode }),
  };
}

/**
 * API §7.1 as one `transaction`: a conditional create of the Encounter
 * (`ifNoneExist` on the appointment, so a concurrent second open cannot add a
 * duplicate) and its AuditEvent (ADR-014). The AuditEvent is conditional on
 * the same appointment: the request that loses the race (its Encounter create
 * matches the winner's, `200`) must not add a second event. The Appointment is not written:
 * it belongs to appointment-service (single-owner rule).
 */
export function buildOpeningWrites(context: OpeningContext): readonly TransactionWrite[] {
  return [
    {
      method: 'POST',
      url: 'Encounter',
      fullUrl: context.fullUrl,
      resource: openedEncounterResource(context),
      ifNoneExist: encounterOfAppointmentQuery(context.appointmentId),
    },
    {
      method: 'POST',
      url: 'AuditEvent',
      resource: buildAuditEvent({
        action: 'C',
        subtype: 'create',
        actorSub: context.actorSub,
        entityRefs: [context.fullUrl],
        patientRef: context.patientRef,
        requestId: context.requestId,
        entityName: openingAuditName(context.appointmentId),
      }),
      ifNoneExist: auditEventByEntityNameQuery(openingAuditName(context.appointmentId)),
    },
  ];
}
