import { BadRequestException } from '@nestjs/common';
import type { FhirResource } from '@medcenter/fhir';
import { FHIR_BY } from '@medcenter/terminology';

import { buildAuditEvent } from '../../../common/audit/audit-event';
import { arrayField, isRecord, stringField } from '../../../common/fhir/fhir-read';
import { versionOf, type TransactionWrite } from '../../../common/fhir/fhir-transaction';
import type { Icd10Ref, TerminologyDisplays, TerminologyRef } from '../../terminology/terminology-validator.service';
import type { CompleteEncounterDto } from '../dto/complete-encounter.dto';
import {
  carePlanResource,
  clinicalImpressionResource,
  conditionResource,
  medicationRequestResource,
  observationResource,
  serviceRequestResource,
  type ClinicalContext,
} from './clinical-resources.mapper';

export interface CompletionContext {
  /** The encounter as read; its `meta.versionId` becomes the `If-Match` of the update. */
  readonly encounter: FhirResource;
  readonly encounterId: string;
  /** The Appointment of the encounter as read (still `booked`); its `meta.versionId` becomes the `If-Match` of its update. */
  readonly appointment: FhirResource;
  readonly appointmentId: string;
  readonly patientRef: string;
  readonly practitionerRoleRef: string;
  readonly actorSub: string;
  /** `X-Request-Id` of the completing request, recorded in both AuditEvents. */
  readonly requestId?: string;
  readonly now: string;
  readonly displays: TerminologyDisplays;
  /** `urn:uuid:` generator for resources created in the bundle (injectable for tests). */
  readonly newFullUrl: () => string;
}

export interface CompletionPlan {
  readonly writes: readonly TransactionWrite[];
  readonly finishedEncounter: FhirResource;
}

interface CreateWrite extends TransactionWrite {
  readonly fullUrl: string;
}

/** ICD-10 codes of the DTO with their request paths (`diagnoses.0.code`), for the 422 `details[].field`. */
export function icd10RefsOf(dto: CompleteEncounterDto): Icd10Ref[] {
  return dto.diagnoses.map((diagnosis, index) => ({ code: diagnosis.code, field: `diagnoses.${index}.code` }));
}

/**
 * Codes of the DTO that must exist in the terminology seed (ATC, UCUM, НСИ),
 * ICD-10 aside, each with its request path (`medicationRequests.1.atcCode`).
 */
export function terminologyRefsOf(dto: CompleteEncounterDto): TerminologyRef[] {
  return [
    ...(dto.medicationRequests ?? []).map((request, index) => ({
      system: FHIR_BY.ATC_CODE_SYSTEM,
      code: request.atcCode,
      field: `medicationRequests.${index}.atcCode`,
    })),
    ...(dto.observations ?? []).flatMap((observation, index) => [
      { system: observation.codeSystem, code: observation.code, field: `observations.${index}.code` },
      { system: FHIR_BY.UCUM_SYSTEM, code: observation.unit, field: `observations.${index}.unit` },
    ]),
    ...(dto.serviceRequests ?? []).map((request, index) => ({
      system: request.codeSystem,
      code: request.code,
      field: `serviceRequests.${index}.code`,
    })),
  ];
}

function create(context: CompletionContext, resource: FhirResource): CreateWrite {
  return { method: 'POST', url: resource.resourceType, fullUrl: context.newFullUrl(), resource };
}

/** `Encounter` closed now: `finished`, period end, previous status kept in `statusHistory`, diagnoses linked by rank. */
function finishedEncounterResource(context: CompletionContext, conditionRefs: readonly string[]): FhirResource {
  const period = isRecord(context.encounter['period']) ? context.encounter['period'] : {};
  const start = stringField(period, 'start') ?? context.now;
  const previousStatus = stringField(context.encounter, 'status') ?? 'in-progress';
  return {
    ...context.encounter,
    status: 'finished',
    period: { ...period, start, end: context.now },
    statusHistory: [
      ...arrayField(context.encounter, 'statusHistory'),
      { status: previousStatus, period: { start, end: context.now } },
    ],
    diagnosis: conditionRefs.map((reference, index) => ({ condition: { reference }, rank: index + 1 })),
  };
}

function clinicalContextOf(context: CompletionContext): ClinicalContext {
  return {
    encounterRef: `Encounter/${context.encounterId}`,
    patientRef: context.patientRef,
    practitionerRoleRef: context.practitionerRoleRef,
    now: context.now,
    displays: context.displays,
  };
}

/** `POST` writes of every clinical resource, Conditions first; `conditionRefs` are their `urn:uuid:` fullUrls. */
function clinicalWrites(context: CompletionContext, dto: CompleteEncounterDto): { created: CreateWrite[]; conditionRefs: string[] } {
  const clinical = clinicalContextOf(context);
  const conditions = dto.diagnoses.map((diagnosis) => create(context, conditionResource(clinical, diagnosis)));
  const conditionRefs = conditions.map((write) => write.fullUrl);
  const primaryDiagnosis = conditionRefs[0];
  if (primaryDiagnosis === undefined) {
    throw new BadRequestException({ errorCode: 'VALIDATION_ERROR', message: 'diagnoses: at least one diagnosis is required' });
  }
  const observations = (dto.observations ?? []).map((observation) => create(context, observationResource(clinical, observation)));
  const observationRefs = observations.map((write) => write.fullUrl);
  const created: CreateWrite[] = [
    ...conditions,
    create(context, clinicalImpressionResource(clinical, dto.summary, conditionRefs, observationRefs)),
    create(context, carePlanResource(clinical, dto.recommendations, conditionRefs)),
    ...observations,
    ...(dto.serviceRequests ?? []).map((request) => create(context, serviceRequestResource(clinical, request, primaryDiagnosis))),
    ...(dto.medicationRequests ?? []).map((request) => create(context, medicationRequestResource(clinical, request, primaryDiagnosis))),
  ];
  return { created, conditionRefs };
}

/** BR-008: the visit took place, so the booked Appointment becomes `fulfilled` (FHIR R4 `AppointmentStatus`). */
function appointmentFulfilment(context: CompletionContext): TransactionWrite {
  return {
    method: 'PUT',
    url: `Appointment/${context.appointmentId}`,
    resource: { ...context.appointment, status: 'fulfilled' },
    ifMatch: versionOf(context.appointment),
  };
}

/**
 * ADR-014 / FR-021: the `update` of the Encounter (`finished`), the `update` of
 * the Appointment (`fulfilled`) and the `create` of the clinical record (API
 * §7.3 `AuditEvent(create)`) are three journal rows, because the audit journal
 * keys each AuditEvent on its first entity.
 */
function auditWrites(context: CompletionContext, created: readonly CreateWrite[]): TransactionWrite[] {
  const audit = (interaction: 'create' | 'update', entityRefs: readonly string[]): TransactionWrite => ({
    method: 'POST',
    url: 'AuditEvent',
    resource: buildAuditEvent({
      action: interaction === 'create' ? 'C' : 'U',
      subtype: interaction,
      actorSub: context.actorSub,
      entityRefs,
      patientRef: context.patientRef,
      requestId: context.requestId,
    }),
  });
  return [
    audit('update', [`Encounter/${context.encounterId}`]),
    audit('update', [`Appointment/${context.appointmentId}`]),
    audit('create', created.map((write) => write.fullUrl)),
  ];
}

/**
 * API §7.3 as one FHIR `transaction` (FR-011…FR-014): `PUT Encounter` guarded by
 * `If-Match`, `PUT Appointment` (`fulfilled`, also under `If-Match`, so a
 * concurrent no-show or cancellation fails the whole bundle), then `POST` of
 * Condition[], ClinicalImpression, CarePlan, Observation[], ServiceRequest[],
 * MedicationRequest[] (each prescription references the encounter and the
 * primary diagnosis, BR-005) and the three AuditEvents (ADR-014). New
 * resources reference each other through `urn:uuid:` fullUrls.
 */
export function buildCompletionPlan(context: CompletionContext, dto: CompleteEncounterDto): CompletionPlan {
  const { created, conditionRefs } = clinicalWrites(context, dto);
  const finishedEncounter = finishedEncounterResource(context, conditionRefs);
  const encounterUpdate: TransactionWrite = {
    method: 'PUT',
    url: `Encounter/${context.encounterId}`,
    resource: finishedEncounter,
    ifMatch: versionOf(context.encounter),
  };
  return { finishedEncounter, writes: [encounterUpdate, appointmentFulfilment(context), ...created, ...auditWrites(context, created)] };
}
