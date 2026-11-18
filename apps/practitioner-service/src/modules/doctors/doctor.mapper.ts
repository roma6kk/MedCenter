import type { FhirResource } from '@medcenter/fhir';
import { toDoctorResponseDto, type ContentLanguage } from '@medcenter/fhir-mappers';

import type { DoctorResponseDto } from './dto/doctor-response.dto';

export function toDoctorDto(
  practitioner: FhirResource,
  practitionerRoleIds: readonly string[] = [],
  lang?: ContentLanguage,
): DoctorResponseDto {
  const doctor = toDoctorResponseDto(practitioner, lang);
  const name = [doctor.firstName, doctor.lastName].filter((part) => part !== '').join(' ');
  return { ...doctor, name, practitionerRoleIds };
}
