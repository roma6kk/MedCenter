import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { WeeklyWindowDto } from './create-schedule.dto';

/**
 * API §5.2.3 `UpdateScheduleDto` — window/horizon edits; the service re-checks
 * `SCHEDULE_OVERLAP` for the same practitioner role.
 *
 * Written explicitly rather than via `PartialType`: `@nestjs/mapped-types` is
 * not a workspace dependency.
 */
export class UpdateScheduleDto {
  @ApiPropertyOptional({ format: 'date', example: '2026-11-02' })
  @IsOptional()
  @IsDateString()
  horizonFrom?: string;

  @ApiPropertyOptional({
    format: 'date',
    example: '2026-12-31',
    description: 'Inclusive; at most 90 days after horizonFrom',
  })
  @IsOptional()
  @IsDateString()
  horizonTo?: string;

  @ApiPropertyOptional({ type: () => [WeeklyWindowDto], minItems: 1 })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WeeklyWindowDto)
  windows?: WeeklyWindowDto[];

  @ApiPropertyOptional({
    minimum: 5,
    maximum: 120,
    example: 30,
    description: 'Slot length, minutes',
  })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(120)
  slotDurationMin?: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
