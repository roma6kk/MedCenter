import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { FHIR_ID_PATTERN } from '@medcenter/common';

import { ListDoctorAppointmentsQueryDto } from './list-doctor-appointments-query.dto';

export class ListAdminAppointmentsQueryDto extends OmitType(ListDoctorAppointmentsQueryDto, ['patient'] as const) {
  @ApiPropertyOptional({
    description: 'PractitionerRole id: only the appointments of this doctor',
    pattern: FHIR_ID_PATTERN.source,
    example: 'role-1',
  })
  @IsOptional()
  @Matches(FHIR_ID_PATTERN, { message: '$property must be a FHIR resource id ([A-Za-z0-9-.]{1,64})' })
  practitionerRoleId?: string;
}
