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
  @IsIn(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'])
  dayOfWeek!: 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

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
  @Matches(FHIR_ID_PATTERN, { message: FHIR_ID_MESSAGE })
  practitionerRoleId!: string;

  @Matches(FHIR_ID_PATTERN, { message: FHIR_ID_MESSAGE })
  roomId!: string;

  @Matches(FHIR_ID_PATTERN, { message: FHIR_ID_MESSAGE })
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
