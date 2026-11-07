import { Trim } from '@medcenter/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { MatchesATC } from '../../../common/validators/matches-atc.validator';

export class MedicationRequestDto {
  @ApiProperty({ description: 'ATC code', example: 'J01FA10' })
  @MatchesATC()
  atcCode!: string;

  @ApiProperty({ description: 'dosageInstruction text', example: '1 таб 3 раза в день после еды', minLength: 3, maxLength: 1000 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(1000)
  dosageText!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}
