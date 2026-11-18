import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { FHIR_ID_PATTERN } from '@medcenter/common';

import { PageQueryDto } from '../../../common/paging/page-query.dto';

export class PrescriptionsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Only the prescriptions written at this encounter (FHIR id)', example: '1234' })
  @IsOptional()
  @IsString()
  @Matches(FHIR_ID_PATTERN, { message: 'encounterId must be a FHIR resource id ([A-Za-z0-9-.]{1,64})' })
  encounterId?: string;
}
