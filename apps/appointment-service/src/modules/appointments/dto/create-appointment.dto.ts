import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { FHIR_ID_PATTERN, Trim } from '@medcenter/common';

const FHIR_ID_MESSAGE = '$property must be a FHIR resource id ([A-Za-z0-9-.]{1,64})';

/** Ids are FHIR `id`s, not UUIDs: generated slots use a SHA-256 hex id and HAPI assigns numeric ones. */
export class CreateAppointmentDto {
  @ApiProperty({
    description: 'Slot id; the slot must be free and must not have started yet',
    pattern: FHIR_ID_PATTERN.source,
    example: '3f2a9c0d',
  })
  @Matches(FHIR_ID_PATTERN, { message: FHIR_ID_MESSAGE })
  slotId!: string;

  @ApiPropertyOptional({
    description: 'Must match the service of the slot schedule; defaults to it',
    pattern: FHIR_ID_PATTERN.source,
    example: '1044',
  })
  @IsOptional()
  @Matches(FHIR_ID_PATTERN, { message: FHIR_ID_MESSAGE })
  serviceId?: string;

  @ApiPropertyOptional({
    minLength: 3,
    maxLength: 500,
    example: 'Болит спина',
    description: 'Free text about health: needs an active EHR consent (CONSENT_REQUIRED)',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}
