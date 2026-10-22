import type { FhirResource } from '@medcenter/fhir';

import {
  readActive,
  readDate,
  readGender,
  readIdentifiers,
  readPhotoUrl,
  readPersonName,
  readTelecom,
} from '../../../shared/fhir-datatypes.mapper';
import type { PatientResponseDto } from '../dto/patient-response.dto';

/** FHIR R4 `Patient` → `PatientResponseDto` (API §3, `FhirToXMapper`). */
export function toPatientResponseDto(patient: FhirResource): PatientResponseDto {
  const birthDate = readDate(patient['birthDate']);
  const gender = readGender(patient['gender']);
  const photoUrl = readPhotoUrl(patient['photo']);
  return {
    id: patient.id ?? '',
    active: readActive(patient['active']),
    ...readPersonName(patient['name']),
    ...(birthDate === undefined ? {} : { birthDate }),
    ...(gender === undefined ? {} : { gender }),
    ...(photoUrl === undefined ? {} : { photoUrl }),
    telecom: readTelecom(patient['telecom']),
    identifiers: readIdentifiers(patient['identifier']),
  };
}
