import { Trim } from '@medcenter/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { MatchesICD10 } from '../../../common/validators/matches-icd10.validator';

export const VERIFICATION_STATUSES = ['working', 'provisional', 'confirmed'] as const;
export type DiagnosisVerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export class ConditionDto {
  @ApiProperty({ description: 'ICD-10 code (ValueSet InternClassificDiseases10)', example: 'J06.9' })
  @MatchesICD10()
  code!: string;

  @ApiProperty({ example: 'Острый назофарингит', maxLength: 500 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  display!: string;

  @ApiPropertyOptional({ enum: VERIFICATION_STATUSES, enumName: 'DiagnosisVerificationStatus' })
  @IsOptional()
  @IsIn(VERIFICATION_STATUSES)
  verificationStatus?: DiagnosisVerificationStatus;
}
