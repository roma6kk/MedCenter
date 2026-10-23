import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { FHIR_ID_PATTERN } from '../fhir-reference';

const FHIR_ID_MESSAGE = '$property must be a FHIR resource id ([A-Za-z0-9-.]{1,64})';

/**
 * API §6.1. Ids are validated as FHIR `id`s, not as UUIDs (deviation from the
 * spec's `@IsUUID()`): catalog-service ids a generated Slot by a 64-hex SHA-256
 * digest and HAPI assigns numeric ids to POSTed resources, so `@IsUUID()` would
 * reject every real slot with `400 VALIDATION_ERROR`.
 */
export class CreateAppointmentDto {
  /** Slot id; `Slot.status` must be `free` (checked atomically at write time, ADR-012). */
  @ApiProperty({
    description: 'Slot id; the slot must be free',
    pattern: FHIR_ID_PATTERN.source,
    example: '3f2a9c0d',
  })
  @Matches(FHIR_ID_PATTERN, { message: FHIR_ID_MESSAGE })
  slotId!: string;

  /** Must match the slot's schedule service when supplied; defaults to it otherwise. */
  @ApiPropertyOptional({
    description: 'Must match the service of the slot schedule; defaults to it',
    pattern: FHIR_ID_PATTERN.source,
    example: '1044',
  })
  @IsOptional()
  @Matches(FHIR_ID_PATTERN, { message: FHIR_ID_MESSAGE })
  serviceId?: string;

  /** Stored as `Appointment.reasonCode[0].text`. */
  @ApiPropertyOptional({
    minLength: 3,
    maxLength: 500,
    example: 'Болит спина',
    description: 'Free text about health: needs an active EHR consent (CONSENT_REQUIRED)',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}
