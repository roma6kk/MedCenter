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
const APPOINTMENT_FLAGS_SYSTEM = 'https://fhir.by/CodeSystem/medcenter-appointment-flags';
const ENCOUNTER_OPENED_FLAG = 'encounter-opened';

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
  return `appointment=Appointment/${appointmentId}&status:not=cancelled`;
}

// The Appointment version in the key: concurrent opens (same version) write one AuditEvent, a reopening after a cancellation (new version) writes its own.
function openingKey(context: OpeningContext): string {
  return `Appointment/${context.appointmentId}@${String((context.appointment['meta'] as { versionId?: unknown }).versionId)}`;
}

function openingAuditName(context: OpeningContext): string {
  return `encounter-opened:${openingKey(context)}`;
}

export function openingBypassName(context: OpeningContext): string {
  return `encounter-emergency-open:${openingKey(context)}`;
}

export function openedEncounterResource(context: OpeningContext): FhirResource {
  return {
    resourceType: 'Encounter',
    status: 'in-progress',
    class: AMBULATORY,
    ...(context.serviceType === undefined ? {} : { serviceType: context.serviceType }),
    subject: { reference: context.patientRef },
    participant: [{ type: [ATTENDER], individual: { reference: context.practitionerRoleRef } }],
    appointment: [{ reference: `Appointment/${context.appointmentId}` }],
    period: { start: context.now },
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
        entityName: openingAuditName(context),
      }),
      ifNoneExist: auditEventByEntityNameQuery(openingAuditName(context)),
    },
    {
      method: 'PUT',
      url: `Appointment/${context.appointmentId}`,
      resource: flaggedAppointment(context.appointment),
      ifMatch: versionOf(context.appointment),
    },
  ];
}

export function unflaggedAppointment(appointment: FhirResource): FhirResource {
  const meta = isRecord(appointment['meta']) ? appointment['meta'] : {};
  const tags = arrayField(meta as FhirResource, 'tag');
  return { ...appointment, meta: { ...meta, tag: tags.filter((tag) => !isOpenedFlag(tag)) } };
}

function isOpenedFlag(tag: unknown): boolean {
  return isRecord(tag) && tag['system'] === APPOINTMENT_FLAGS_SYSTEM && tag['code'] === ENCOUNTER_OPENED_FLAG;
}

function flaggedAppointment(appointment: FhirResource): FhirResource {
  const meta = isRecord(appointment['meta']) ? appointment['meta'] : {};
  const tags = arrayField(meta as FhirResource, 'tag');
  const flagged = tags.some(isOpenedFlag);
  return {
    ...appointment,
    meta: { ...meta, tag: flagged ? tags : [...tags, { system: APPOINTMENT_FLAGS_SYSTEM, code: ENCOUNTER_OPENED_FLAG }] },
  };
}
