import { IsIn, IsOptional, Matches } from 'class-validator';

import { FHIR_ID_PATTERN } from '../../../common/fhir-id';

/**
 * `?doctorId=&active=` of API §5.2.2. `doctorId` becomes `actor=PractitionerRole/{id}`
 * in a reference search: a comma would turn it into an OR over other roles, so it
 * must be a single FHIR id. `active` goes to HAPI as a token.
 */
export class ListSchedulesQueryDto {
  @IsOptional()
  @Matches(FHIR_ID_PATTERN, { message: 'doctorId must be a FHIR resource id' })
  doctorId?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  active?: 'true' | 'false';
}
