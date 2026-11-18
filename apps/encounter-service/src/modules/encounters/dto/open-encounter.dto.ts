import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { FHIR_ID_PATTERN } from '@medcenter/common';

import { EmergencyReason } from './emergency-reason.decorator';

// Any FHIR id is accepted, not only UUIDs: HAPI assigns non-UUID ids to POSTed resources (appointment-service books by transaction POST).
export class OpenEncounterDto {
  @ApiProperty({ description: 'Id of the booked Appointment (FHIR id)', example: '1234', pattern: '^[A-Za-z0-9\\-.]{1,64}$' })
  @IsString()
  @Matches(FHIR_ID_PATTERN, { message: 'appointmentId must be a FHIR resource id ([A-Za-z0-9-.]{1,64})' })
  appointmentId!: string;

  @ApiPropertyOptional({ description: 'Opens without the patient consent (ADR-019); the reason is journalled', minLength: 10, maxLength: 500 })
  @IsOptional()
  @EmergencyReason()
  emergencyReason?: string;
}
