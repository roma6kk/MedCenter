import type { FhirResource } from '@medcenter/fhir';

import { arrayField, firstCoding, firstNote, numberField, referenceField, stringField } from '../../../common/fhir/fhir-read';
import { canonicalReference } from '../../../common/fhir/fhir-reference';
import type { DiagnosisVerificationStatus } from '../dto/condition.dto';
import type {
  DiagnosisViewDto,
  MedicationRequestViewDto,
  ObservationViewDto,
  ServiceRequestViewDto,
} from '../dto/encounter-response.dto';

/** R4 `condition-ver-status` → API verification status (inverse of `VERIFICATION_TO_R4`). */
const R4_TO_VERIFICATION: Partial<Readonly<Record<string, DiagnosisVerificationStatus>>> = {
  unconfirmed: 'working',
  provisional: 'provisional',
  confirmed: 'confirmed',
};

/** `{ [key]: value }` when the value is present, `{}` otherwise — keeps `undefined` out of responses. */
function optional<TKey extends string, TValue>(key: TKey, value: TValue | undefined): Partial<Record<TKey, TValue>> {
  return value === undefined ? {} : ({ [key]: value } as Partial<Record<TKey, TValue>>);
}

/** `Condition` → diagnosis (code, display, API verification status). */
export function diagnosisView(condition: FhirResource): DiagnosisViewDto | undefined {
  const coding = firstCoding(condition, 'code');
  if (coding?.code === undefined) {
    return undefined;
  }
  const r4Status = firstCoding(condition, 'verificationStatus')?.code;
  return {
    code: coding.code,
    display: coding.display ?? stringField(condition['code'], 'text') ?? coding.code,
    ...optional('verificationStatus', r4Status === undefined ? undefined : R4_TO_VERIFICATION[r4Status]),
  };
}

/** `Observation` with a UCUM `valueQuantity` → measurement. */
export function observationView(observation: FhirResource): ObservationViewDto | undefined {
  const coding = firstCoding(observation, 'code');
  const quantity = observation['valueQuantity'];
  const value = numberField(quantity, 'value');
  if (coding?.system === undefined || coding.code === undefined || value === undefined) {
    return undefined;
  }
  return {
    codeSystem: coding.system,
    code: coding.code,
    ...optional('display', coding.display),
    value,
    unit: stringField(quantity, 'code') ?? stringField(quantity, 'unit') ?? '',
  };
}

export function serviceRequestView(request: FhirResource): ServiceRequestViewDto | undefined {
  const coding = firstCoding(request, 'code');
  if (coding?.system === undefined || coding.code === undefined) {
    return undefined;
  }
  return {
    codeSystem: coding.system,
    code: coding.code,
    ...optional('display', coding.display),
    ...optional('note', firstNote(request)),
  };
}

export function medicationRequestView(request: FhirResource): MedicationRequestViewDto | undefined {
  const coding = firstCoding(request, 'medicationCodeableConcept');
  if (coding?.code === undefined) {
    return undefined;
  }
  return {
    atcCode: coding.code,
    ...optional('atcDisplay', coding.display),
    dosageText: stringField(arrayField(request, 'dosageInstruction')[0], 'text') ?? '',
    ...optional('note', firstNote(request)),
  };
}

/** Resources whose `encounter` reference points at `encounterRef` (`Encounter/{id}`). */
export function relatedTo(encounterRef: string, resources: readonly FhirResource[]): FhirResource[] {
  return resources.filter((resource) => canonicalReference(referenceField(resource, 'encounter'), 'Encounter') === encounterRef);
}

export function ofType(resources: readonly FhirResource[], resourceType: string): FhirResource[] {
  return resources.filter((resource) => resource.resourceType === resourceType);
}

/** Map entries for the defined results of `view` only. */
export function viewsOf<TView>(resources: readonly FhirResource[], view: (resource: FhirResource) => TView | undefined): TView[] {
  return resources.map(view).filter((item): item is TView => item !== undefined);
}

/**
 * Diagnoses of an encounter in `Encounter.diagnosis.rank` order (primary first);
 * conditions the encounter does not rank keep their search order, after the ranked ones.
 */
export function rankedDiagnoses(encounter: FhirResource, conditions: readonly FhirResource[]): DiagnosisViewDto[] {
  const ranks = new Map<string, number>();
  for (const entry of arrayField(encounter, 'diagnosis')) {
    const reference = canonicalReference(referenceField(entry, 'condition'), 'Condition');
    if (reference !== undefined) {
      ranks.set(reference, numberField(entry, 'rank') ?? Number.MAX_SAFE_INTEGER);
    }
  }
  const rankOf = (condition: FhirResource): number => ranks.get(`Condition/${condition.id ?? ''}`) ?? Number.MAX_SAFE_INTEGER;
  const ordered = [...conditions].sort((left, right) => rankOf(left) - rankOf(right));
  return viewsOf(ordered, diagnosisView);
}
