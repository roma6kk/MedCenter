import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CONSENTER_TYPES,
  CONSENT_ENTRY_STATUSES,
  type ConsenterType,
  type ConsentEntryStatus,
  type CreateConsentRequest,
} from '@medcenter/contracts';
import { IsIn, IsISO8601, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

import { FHIR_ID_PATTERN } from '../../access/patient-identity';

const NOT_BLANK = /\S/;

/** API §3.8 body: the paper form entered by a clerk or a doctor (ADR-019). */
export class CreateConsentDto implements CreateConsentRequest {
  @ApiPropertyOptional({ enum: CONSENT_ENTRY_STATUSES, enumName: 'ConsentEntryStatus', default: 'active', description: 'rejected is a written refusal' })
  @IsOptional()
  @IsIn(CONSENT_ENTRY_STATUSES)
  readonly status?: ConsentEntryStatus;

  @ApiProperty({ description: 'Number of the paper form (Consent.identifier)', minLength: 1, maxLength: 64 })
  @IsString()
  @Length(1, 64)
  @Matches(NOT_BLANK, { message: 'formNumber must not be blank' })
  readonly formNumber!: string;

  @ApiProperty({ description: 'Signing date, YYYY-MM-DD or RFC 3339, not in the future', example: '2026-10-01' })
  @IsISO8601()
  readonly signedAt!: string;

  @ApiProperty({ description: 'scanId returned by 3.10', pattern: '^[A-Za-z0-9\\-.]{1,64}$' })
  @Matches(FHIR_ID_PATTERN, { message: 'scanId must be a FHIR resource id ([A-Za-z0-9-.]{1,64})' })
  readonly scanId!: string;

  @ApiProperty({ enum: CONSENTER_TYPES, enumName: 'ConsenterType' })
  @IsIn(CONSENTER_TYPES)
  readonly consenterType!: ConsenterType;

  @ApiPropertyOptional({ description: 'Required unless consenterType is self; must belong to this patient', pattern: '^[A-Za-z0-9\\-.]{1,64}$' })
  @IsOptional()
  @Matches(FHIR_ID_PATTERN, {
    message: 'relatedPersonId must be a FHIR resource id ([A-Za-z0-9-.]{1,64})',
  })
  readonly relatedPersonId?: string;

  @ApiPropertyOptional({ description: 'Document of the representative authority; required unless consenterType is self', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(NOT_BLANK, { message: 'representativeDocument must not be blank' })
  readonly representativeDocument?: string;

  @ApiPropertyOptional({ description: 'Name of the clerk; required for ADMIN, taken from the token for DOCTOR', minLength: 1, maxLength: 200 })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  @Matches(NOT_BLANK, { message: 'signedByName must not be blank' })
  readonly signedByName?: string;
}
