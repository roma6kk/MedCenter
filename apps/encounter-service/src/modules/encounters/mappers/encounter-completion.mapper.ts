import { BadRequestException } from '@nestjs/common';
import type { FhirResource } from '@medcenter/fhir';
import { FHIR_BY } from '@medcenter/terminology';

import { buildAuditEvent } from '../../../common/audit/audit-event';
import { arrayField, isRecord, stringField } from '../../../common/fhir/fhir-read';
import { versionOf, type TransactionWrite } from '../../../common/fhir/fhir-transaction';
import type { TerminologyDisplays, TerminologyRef } from '../../terminology/terminology-validator.service';
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
  readonly patientRef: string;
  readonly practitionerRoleRef: string;
  readonly actorSub: string;
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

/** Codes of the DTO that must exist in the terminology seed (ATC, UCUM, НСИ), ICD-10 aside. */
export function terminologyRefsOf(dto: CompleteEncounterDto): TerminologyRef[] {
  return [
    ...(dto.medicationRequests ?? []).map((request) => ({ system: FHIR_BY.ATC_CODE_SYSTEM, code: request.atcCode })),
    ...(dto.observations ?? []).flatMap((observation) => [
      { system: observation.codeSystem, code: observation.code },
      { system: FHIR_BY.UCUM_SYSTEM, code: observation.unit },
    ]),
    ...(dto.serviceRequests ?? []).map((request) => ({ system: request.codeSystem, code: request.code })),
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

/**
 * ADR-014 / FR-021: the `update` of the Encounter (`finished`) and the `create`
 * of the clinical record (API §7.3 `AuditEvent(create)`) are two journal rows,
 * because the audit journal keys each AuditEvent on its first entity.
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
    }),
  });
  return [audit('update', [`Encounter/${context.encounterId}`]), audit('create', created.map((write) => write.fullUrl))];
}

/**
 * API §7.3 as one FHIR `transaction` (FR-011…FR-014): `PUT Encounter` guarded by
 * `If-Match`, then `POST` of Condition[], ClinicalImpression, CarePlan,
 * Observation[], ServiceRequest[], MedicationRequest[] (each prescription
 * references the encounter and the primary diagnosis, BR-005) and the two
 * AuditEvents (ADR-014). New resources reference each other through `urn:uuid:` fullUrls.
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
  return { finishedEncounter, writes: [encounterUpdate, ...created, ...auditWrites(context, created)] };
}
