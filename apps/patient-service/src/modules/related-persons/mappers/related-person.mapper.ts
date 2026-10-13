import type { FhirResource } from '@medcenter/fhir';

import {
  readActive,
  readConcepts,
  readDate,
  readGender,
  readPersonName,
  readTelecom,
} from '../../../shared/fhir-datatypes.mapper';
import type { RelatedPersonResponseDto } from '../dto/related-person-response.dto';

/** Bare id of `RelatedPerson.patient.reference` (`Patient/9f2c` or an absolute URL). */
export function relatedPatientIdOf(relatedPerson: FhirResource): string {
  const reference = (relatedPerson['patient'] as { reference?: unknown } | undefined)?.reference;
  if (typeof reference !== 'string') {
    return '';
  }
  const match = /(?:^|\/)Patient\/([^/]+)$/.exec(reference);
  return match?.[1] ?? '';
}

/** FHIR R4 `RelatedPerson` → `RelatedPersonResponseDto` (API §3.3). */
export function toRelatedPersonResponseDto(relatedPerson: FhirResource): RelatedPersonResponseDto {
  const gender = readGender(relatedPerson['gender']);
  const birthDate = readDate(relatedPerson['birthDate']);
  return {
    id: relatedPerson.id ?? '',
    patientId: relatedPatientIdOf(relatedPerson),
    active: readActive(relatedPerson['active']),
    ...readPersonName(relatedPerson['name']),
    relationship: readConcepts(relatedPerson['relationship']),
    ...(gender === undefined ? {} : { gender }),
    ...(birthDate === undefined ? {} : { birthDate }),
    telecom: readTelecom(relatedPerson['telecom']),
  };
}
