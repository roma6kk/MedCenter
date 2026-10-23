import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { MatchesICD10 } from '../../../common/validators/matches-icd10.validator';

export const VERIFICATION_STATUSES = ['working', 'provisional', 'confirmed'] as const;
export type DiagnosisVerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** API §7.3 — one diagnosis, stored as `Condition` (category=encounter-diagnosis, BR-004). */
export class ConditionDto {
  /** ICD-10 (адапт. МЗ РБ), e.g. `J06.9`. */
  @ApiProperty({ description: 'ICD-10 code (ValueSet InternClassificDiseases10)', example: 'J06.9' })
  @MatchesICD10()
  code!: string;

  @ApiProperty({ example: 'Острый назофарингит', maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  display!: string;

  @ApiPropertyOptional({ enum: VERIFICATION_STATUSES, enumName: 'DiagnosisVerificationStatus' })
  @IsOptional()
  @IsIn(VERIFICATION_STATUSES)
  verificationStatus?: DiagnosisVerificationStatus;
}
