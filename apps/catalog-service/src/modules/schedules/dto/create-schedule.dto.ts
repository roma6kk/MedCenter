import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
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

import { FHIR_ID_PATTERN } from '../../../common/fhir-id';

const FHIR_ID_MESSAGE = '$property must be a FHIR resource id';

/**
 * One weekly availability window inside a `Schedule.planningHorizon`.
 * `startTime`/`endTime` are clinic wall-clock times (Europe/Minsk, UTC+3) and
 * `dayOfWeek` is the clinic weekday: a `09:00` window yields slots from 06:00Z.
 *
 * The zone is fixed by this service, not by API §5.2.1 (the spec does not name
 * one yet; it is pending a spec update). `tools/demo-seed` stores its windows
 * the same way. Windows that an older generator read as UTC are not converted:
 * see the migration note in `tasks/TASK-001/coder-m2-gaps-report.md`.
 */
export class WeeklyWindowDto {
  @ApiProperty({ enum: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'], description: 'Clinic weekday' })
  @IsIn(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'])
  dayOfWeek!: 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

  @ApiProperty({
    pattern: '^([01]\\d|2[0-3]):[0-5]\\d$',
    example: '09:00',
    description: 'Clinic wall-clock time, HH:mm',
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @ApiProperty({
    pattern: '^([01]\\d|2[0-3]):[0-5]\\d$',
    example: '13:00',
    description: 'Clinic wall-clock time, HH:mm; after startTime',
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;
}

/**
 * API §5.2.1 `CreateScheduleDto` (FR-020, ADR-015). The three actor ids are
 * validated as FHIR `id`s, not as UUIDs (deviation from the spec's `@IsUUID()`):
 * HAPI assigns sequential numeric ids to rooms and services created through
 * `POST /admin/rooms` and `POST /admin/services`, so `@IsUUID()` made every room
 * and service created through the API unusable in a schedule (found by the stack smoke).
 */
export class CreateScheduleDto {
  @ApiProperty({
    description: 'PractitionerRole id (FHIR id)',
    pattern: FHIR_ID_PATTERN.source,
    example: '1042',
  })
  @Matches(FHIR_ID_PATTERN, { message: FHIR_ID_MESSAGE })
  practitionerRoleId!: string;

  @ApiProperty({
    description: 'Location (room) id (FHIR id)',
    pattern: FHIR_ID_PATTERN.source,
    example: '1043',
  })
  @Matches(FHIR_ID_PATTERN, { message: FHIR_ID_MESSAGE })
  roomId!: string;

  @ApiProperty({
    description: 'HealthcareService id (FHIR id)',
    pattern: FHIR_ID_PATTERN.source,
    example: '1044',
  })
  @Matches(FHIR_ID_PATTERN, { message: FHIR_ID_MESSAGE })
  serviceId!: string;

  @ApiProperty({ format: 'date', example: '2026-11-02' })
  @IsDateString()
  horizonFrom!: string;

  /** Inclusive planning horizon end — never more than 90 days after `horizonFrom`. */
  @ApiProperty({
    format: 'date',
    example: '2026-12-31',
    description: 'Inclusive; at most 90 days after horizonFrom',
  })
  @IsDateString()
  horizonTo!: string;

  @ApiProperty({ type: () => [WeeklyWindowDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WeeklyWindowDto)
  windows!: WeeklyWindowDto[];

  @ApiProperty({ minimum: 5, maximum: 120, example: 30, description: 'Slot length, minutes' })
  @IsInt()
  @Min(5)
  @Max(120)
  slotDurationMin!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
