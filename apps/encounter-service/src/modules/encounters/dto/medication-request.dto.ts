import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { MatchesATC } from '../../../common/validators/matches-atc.validator';

/** API §7.3 — one prescription, stored as `MedicationRequest` with an ATC code (BR-005, BR-009). */
export class MedicationRequestDto {
  @ApiProperty({ description: 'ATC code', example: 'J01FA10' })
  @MatchesATC()
  atcCode!: string;

  /** `MedicationRequest.dosageInstruction[0].text`. */
  @ApiProperty({ description: 'dosageInstruction text', example: '1 таб 3 раза в день после еды', minLength: 3, maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(1000)
  dosageText!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
