import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** One weekly availability window inside a `Schedule.planningHorizon`. */
export class WeeklyWindowDto {
  @IsIn(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'])
  dayOfWeek!: 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;
}

/** API §5.2.1 `CreateScheduleDto` (FR-020, ADR-015). */
export class CreateScheduleDto {
  @IsUUID()
  practitionerRoleId!: string;

  @IsUUID()
  roomId!: string;

  @IsUUID()
  serviceId!: string;

  @IsDateString()
  horizonFrom!: string;

  /** Inclusive planning horizon end — never more than 90 days after `horizonFrom`. */
  @IsDateString()
  horizonTo!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WeeklyWindowDto)
  windows!: WeeklyWindowDto[];

  @IsInt()
  @Min(5)
  @Max(120)
  slotDurationMin!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
