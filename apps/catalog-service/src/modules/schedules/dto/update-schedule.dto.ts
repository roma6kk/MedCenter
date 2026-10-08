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
  @IsOptional()
  @IsDateString()
  horizonFrom?: string;

  @IsOptional()
  @IsDateString()
  horizonTo?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WeeklyWindowDto)
  windows?: WeeklyWindowDto[];

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(120)
  slotDurationMin?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
