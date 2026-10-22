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
  @IsOptional()
  @IsIn(CONSENT_ENTRY_STATUSES)
  readonly status?: ConsentEntryStatus;

  @IsString()
  @Length(1, 64)
  @Matches(NOT_BLANK, { message: 'formNumber must not be blank' })
  readonly formNumber!: string;

  @IsISO8601()
  readonly signedAt!: string;

  @Matches(FHIR_ID_PATTERN, { message: 'scanId must be a FHIR resource id ([A-Za-z0-9-.]{1,64})' })
  readonly scanId!: string;

  @IsIn(CONSENTER_TYPES)
  readonly consenterType!: ConsenterType;

  @IsOptional()
  @Matches(FHIR_ID_PATTERN, {
    message: 'relatedPersonId must be a FHIR resource id ([A-Za-z0-9-.]{1,64})',
  })
  readonly relatedPersonId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(NOT_BLANK, { message: 'representativeDocument must not be blank' })
  readonly representativeDocument?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  @Matches(NOT_BLANK, { message: 'signedByName must not be blank' })
  readonly signedByName?: string;
}
