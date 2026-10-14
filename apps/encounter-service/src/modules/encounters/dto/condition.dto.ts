import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { MatchesICD10 } from '../../../common/validators/matches-icd10.validator';

export const VERIFICATION_STATUSES = ['working', 'provisional', 'confirmed'] as const;
export type DiagnosisVerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** API §7.3 — one diagnosis, stored as `Condition` (category=encounter-diagnosis, BR-004). */
export class ConditionDto {
  /** ICD-10 (адапт. МЗ РБ), e.g. `J06.9`. */
  @MatchesICD10()
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  display!: string;

  @IsOptional()
  @IsIn(VERIFICATION_STATUSES)
  verificationStatus?: DiagnosisVerificationStatus;
}
