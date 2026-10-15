import type { FhirResource } from '@medcenter/fhir';
import { toDoctorResponseDto } from '@medcenter/fhir-mappers';

import type { DoctorResponseDto } from './dto/doctor-response.dto';

/** `Practitioner` -> API §4.1/4.2 DTO: the shared mapping plus the display `name` (given + family). */
export function toDoctorDto(practitioner: FhirResource): DoctorResponseDto {
  const doctor = toDoctorResponseDto(practitioner);
  const name = [doctor.firstName, doctor.lastName].filter((part) => part !== '').join(' ');
  return { ...doctor, name };
}
