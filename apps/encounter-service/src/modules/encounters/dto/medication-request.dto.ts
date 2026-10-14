import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { MatchesATC } from '../../../common/validators/matches-atc.validator';

/** API §7.3 — one prescription, stored as `MedicationRequest` with an ATC code (BR-005, BR-009). */
export class MedicationRequestDto {
  @MatchesATC()
  atcCode!: string;

  /** `MedicationRequest.dosageInstruction[0].text`. */
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(1000)
  dosageText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
