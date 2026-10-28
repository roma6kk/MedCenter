import type { FhirResource } from '@medcenter/fhir';
import { toDoctorResponseDto, type ContentLanguage } from '@medcenter/fhir-mappers';

import type { DoctorResponseDto } from './dto/doctor-response.dto';

/**
 * `Practitioner` -> API §4.1/4.2 DTO: the shared mapping plus the display `name` (given + family) and the ids of
 * the doctor's `PractitionerRole`s (found by the caller: a Practitioner does not know its roles). `lang` localizes name and specialty.
 */
export function toDoctorDto(
  practitioner: FhirResource,
  practitionerRoleIds: readonly string[] = [],
  lang?: ContentLanguage,
): DoctorResponseDto {
  const doctor = toDoctorResponseDto(practitioner, lang);
  const name = [doctor.firstName, doctor.lastName].filter((part) => part !== '').join(' ');
  return { ...doctor, name, practitionerRoleIds };
}
