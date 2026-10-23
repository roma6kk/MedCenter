import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

import { FHIR_ID_PATTERN } from '../../../common/access/claims-identity';
import { EmergencyReason } from './emergency-reason.decorator';

/**
 * API §7.1 — open an encounter for a booked appointment (BR-008).
 *
 * The spec types `appointmentId` as a UUID, but HAPI assigns its own ids to
 * resources created by `POST` (appointment-service books through a transaction
 * `POST`), and those are not UUIDs. Any FHIR `id` is therefore accepted; the
 * grammar still keeps `,` and `/` out of the FHIR read.
 */
export class OpenEncounterDto {
  @ApiProperty({ description: 'Id of the booked Appointment (FHIR id)', example: '1234', pattern: '^[A-Za-z0-9\\-.]{1,64}$' })
  @IsString()
  @Matches(FHIR_ID_PATTERN, { message: 'appointmentId must be a FHIR resource id ([A-Za-z0-9-.]{1,64})' })
  appointmentId!: string;

  /** ADR-019: the patient cannot consent now; opens without a consent and journals the reason. */
  @ApiPropertyOptional({ description: 'Opens without the patient consent (ADR-019); the reason is journalled', minLength: 10, maxLength: 500 })
  @IsOptional()
  @EmergencyReason()
  emergencyReason?: string;
}
