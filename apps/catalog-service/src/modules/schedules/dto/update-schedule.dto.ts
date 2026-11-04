import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { CALENDAR_DATE } from '../../../common/zoned-date';
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
  @IsDateString({ strict: true })
  @Matches(CALENDAR_DATE, { message: 'horizonFrom must be a calendar date YYYY-MM-DD' })
  horizonFrom?: string;

  @ApiPropertyOptional({
    format: 'date',
    example: '2026-12-31',
    description: 'Inclusive; at most 90 days after horizonFrom',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(CALENDAR_DATE, { message: 'horizonTo must be a calendar date YYYY-MM-DD' })
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
