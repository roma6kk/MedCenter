import type { FhirResource } from '@medcenter/fhir';
import { FHIR_BY } from '@medcenter/terminology';

import { displayKey, ICD10_CODE_SYSTEM, type TerminologyDisplays } from '../../terminology/terminology-validator.service';
import type { ConditionDto, DiagnosisVerificationStatus } from '../dto/condition.dto';
import type { MedicationRequestDto } from '../dto/medication-request.dto';
import type { ObservationDto } from '../dto/observation.dto';
import type { ServiceRequestDto } from '../dto/service-request.dto';

/** What every clinical resource of one completion shares. */
export interface ClinicalContext {
  readonly encounterRef: string;
  readonly patientRef: string;
  readonly practitionerRoleRef: string;
  readonly now: string;
  readonly displays: TerminologyDisplays;
}

export const VERIFICATION_STATUS_SYSTEM = 'http://terminology.hl7.org/CodeSystem/condition-ver-status';

/**
 * API verification status → R4 `condition-ver-status` (required binding). R4 has
 * no `working`; a working diagnosis is one without sufficient evidence to be
 * confirmed, which is exactly R4 `unconfirmed`.
 */
export const VERIFICATION_TO_R4: Readonly<Record<DiagnosisVerificationStatus, string>> = {
  working: 'unconfirmed',
  provisional: 'provisional',
  confirmed: 'confirmed',
};

const ENCOUNTER_DIAGNOSIS = {
  coding: [
    {
      system: 'http://terminology.hl7.org/CodeSystem/condition-category',
      code: 'encounter-diagnosis',
      display: 'Encounter Diagnosis',
    },
  ],
};

const CLINICAL_STATUS_ACTIVE = {
  coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
};

function codeableConcept(system: string, code: string, display: string | undefined): Record<string, unknown> {
  return {
    coding: [{ system, code, ...(display === undefined ? {} : { display }) }],
    ...(display === undefined ? {} : { text: display }),
  };
}

function patientAndEncounter(context: ClinicalContext): Record<string, unknown> {
  return { subject: { reference: context.patientRef }, encounter: { reference: context.encounterRef } };
}

function noteOf(note: string | undefined): Record<string, unknown> {
  return note === undefined || note === '' ? {} : { note: [{ text: note }] };
}

/** Diagnosis (FR-012, BR-004): ICD-10 `Condition` in the context of the encounter. */
export function conditionResource(context: ClinicalContext, diagnosis: ConditionDto): FhirResource {
  const status = diagnosis.verificationStatus;
  return {
    resourceType: 'Condition',
    clinicalStatus: CLINICAL_STATUS_ACTIVE,
    ...(status === undefined
      ? {}
      : { verificationStatus: { coding: [{ system: VERIFICATION_STATUS_SYSTEM, code: VERIFICATION_TO_R4[status] }] } }),
    category: [ENCOUNTER_DIAGNOSIS],
    code: codeableConcept(ICD10_CODE_SYSTEM, diagnosis.code, diagnosis.display),
    ...patientAndEncounter(context),
    recordedDate: context.now,
    recorder: { reference: context.practitionerRoleRef },
    asserter: { reference: context.practitionerRoleRef },
  };
}

/** Result of the visit (FR-011): summary, findings = diagnoses, investigations = observations. */
export function clinicalImpressionResource(
  context: ClinicalContext,
  summary: string,
  conditionRefs: readonly string[],
  observationRefs: readonly string[],
): FhirResource {
  return {
    resourceType: 'ClinicalImpression',
    status: 'completed',
    ...patientAndEncounter(context),
    effectiveDateTime: context.now,
    date: context.now,
    assessor: { reference: context.practitionerRoleRef },
    summary,
    finding: conditionRefs.map((reference) => ({ itemReference: { reference } })),
    ...(observationRefs.length === 0
      ? {}
      : { investigation: [{ code: { text: 'Объективные данные' }, item: observationRefs.map((reference) => ({ reference })) }] }),
  };
}

/** Recommendations (FR-013) addressing the diagnoses. */
export function carePlanResource(context: ClinicalContext, recommendations: string, conditionRefs: readonly string[]): FhirResource {
  return {
    resourceType: 'CarePlan',
    status: 'active',
    intent: 'plan',
    title: 'Рекомендации по итогам приёма',
    description: recommendations,
    ...patientAndEncounter(context),
    created: context.now,
    author: { reference: context.practitionerRoleRef },
    addresses: conditionRefs.map((reference) => ({ reference })),
  };
}

/** Measurement with a UCUM quantity (BR-009). */
export function observationResource(context: ClinicalContext, observation: ObservationDto): FhirResource {
  return {
    resourceType: 'Observation',
    status: 'final',
    code: codeableConcept(observation.codeSystem, observation.code, context.displays.get(displayKey(observation.codeSystem, observation.code))),
    ...patientAndEncounter(context),
    effectiveDateTime: context.now,
    issued: context.now,
    performer: [{ reference: context.practitionerRoleRef }],
    valueQuantity: { value: observation.value, unit: observation.unit, system: FHIR_BY.UCUM_SYSTEM, code: observation.unit },
  };
}

/** Referral / procedure order (FR-014) linked to the encounter and the diagnosis (BR-005). */
export function serviceRequestResource(context: ClinicalContext, request: ServiceRequestDto, reasonRef: string): FhirResource {
  return {
    resourceType: 'ServiceRequest',
    status: 'active',
    intent: 'order',
    code: codeableConcept(request.codeSystem, request.code, context.displays.get(displayKey(request.codeSystem, request.code))),
    ...patientAndEncounter(context),
    authoredOn: context.now,
    requester: { reference: context.practitionerRoleRef },
    reasonReference: [{ reference: reasonRef }],
    ...noteOf(request.note),
  };
}

/** Prescription (FR-014) with an ATC code (BR-009), linked to the encounter and the diagnosis (BR-005). */
export function medicationRequestResource(context: ClinicalContext, request: MedicationRequestDto, reasonRef: string): FhirResource {
  const atc = FHIR_BY.ATC_CODE_SYSTEM;
  return {
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    medicationCodeableConcept: codeableConcept(atc, request.atcCode, context.displays.get(displayKey(atc, request.atcCode))),
    ...patientAndEncounter(context),
    authoredOn: context.now,
    requester: { reference: context.practitionerRoleRef },
    reasonReference: [{ reference: reasonRef }],
    dosageInstruction: [{ text: request.dosageText }],
    ...noteOf(request.note),
  };
}
