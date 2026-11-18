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
  registerDecorator,
  ValidateNested,
  type ValidationArguments,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FHIR_ID_PATTERN } from '@medcenter/common';

import { CALENDAR_DATE } from '../../../common/zoned-date';
import { toMinutes } from '../slot-planner';

const FHIR_ID_MESSAGE = '$property must be a FHIR resource id';

function IsAfterStartTime(): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      name: 'isAfterStartTime',
      target: target.constructor,
      propertyName: String(propertyKey),
      options: { message: 'endTime must be after startTime' },
      validator: {
        validate: (value: unknown, args: ValidationArguments): boolean => {
          const startTime = (args.object as { startTime?: unknown }).startTime;
          return typeof value === 'string' && typeof startTime === 'string' && toMinutes(value) > toMinutes(startTime);
        },
      },
    });
  };
}

/** `startTime`/`endTime` are clinic wall-clock times (Europe/Minsk) and `dayOfWeek` is the clinic weekday. */
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
  @IsAfterStartTime()
  endTime!: string;
}

/** The actor ids are FHIR `id`s, not UUIDs: HAPI assigns sequential numeric ids to rooms and roles. */
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
  @IsDateString({ strict: true })
  @Matches(CALENDAR_DATE, { message: 'horizonFrom must be a calendar date YYYY-MM-DD' })
  horizonFrom!: string;

  @ApiProperty({
    format: 'date',
    example: '2026-12-31',
    description: 'Inclusive; at most 90 days after horizonFrom',
  })
  @IsDateString({ strict: true })
  @Matches(CALENDAR_DATE, { message: 'horizonTo must be a calendar date YYYY-MM-DD' })
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
