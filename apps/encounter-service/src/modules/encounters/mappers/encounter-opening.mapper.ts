import type { FhirResource } from '@medcenter/fhir';

import { auditEventByEntityNameQuery, buildAuditEvent } from '../../../common/audit/audit-event';
import { arrayField, isRecord } from '../../../common/fhir/fhir-read';
import { versionOf, type TransactionWrite } from '../../../common/fhir/fhir-transaction';

export interface OpeningContext {
  readonly appointmentId: string;
  readonly appointment: FhirResource;
  readonly patientRef: string;
  readonly practitionerRoleRef: string;
  readonly serviceType?: Readonly<Record<string, unknown>>;
  readonly actorSub: string;
  readonly requestId?: string;
  readonly now: string;
  readonly fullUrl: string;
}

// Only makes the opening change the Appointment version, so the If-Match write is a real conflict guard.
export const APPOINTMENT_FLAGS_SYSTEM = 'https://fhir.by/CodeSystem/medcenter-appointment-flags';
export const ENCOUNTER_OPENED_FLAG = 'encounter-opened';

const AMBULATORY = {
  system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  code: 'AMB',
  display: 'ambulatory',
} as const;

const ATTENDER = {
  coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType', code: 'ATND', display: 'attender' }],
} as const;

export function serviceTypeOf(service: FhirResource): Readonly<Record<string, unknown>> | undefined {
  const type = arrayField(service, 'type')[0];
  return isRecord(type) ? type : undefined;
}

export function encounterOfAppointmentQuery(appointmentId: string): string {
  return `appointment=Appointment/${appointmentId}`;
}

export function openingAuditName(appointmentId: string): string {
  return `encounter-opened:Appointment/${appointmentId}`;
}

export function openingBypassName(appointmentId: string): string {
  return `encounter-emergency-open:Appointment/${appointmentId}`;
}

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
    {
      method: 'PUT',
      url: `Appointment/${context.appointmentId}`,
      resource: flaggedAppointment(context.appointment),
      ifMatch: versionOf(context.appointment),
    },
  ];
}

export function flaggedAppointment(appointment: FhirResource): FhirResource {
  const meta = isRecord(appointment['meta']) ? appointment['meta'] : {};
  const tags = arrayField(meta as FhirResource, 'tag');
  const flagged = tags.some((tag) => isRecord(tag) && tag['system'] === APPOINTMENT_FLAGS_SYSTEM && tag['code'] === ENCOUNTER_OPENED_FLAG);
  return {
    ...appointment,
    meta: { ...meta, tag: flagged ? tags : [...tags, { system: APPOINTMENT_FLAGS_SYSTEM, code: ENCOUNTER_OPENED_FLAG }] },
  };
}
