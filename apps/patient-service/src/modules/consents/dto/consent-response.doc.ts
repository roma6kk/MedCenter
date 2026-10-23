import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CONSENTER_TYPES,
  CONSENT_STATUSES,
  type ConsenterType,
  type ConsentResponse,
  type ConsentScanRef,
  type ConsentScanUploadResponse,
  type ConsentStatus,
  type PatientConsentResponse,
} from '@medcenter/contracts';

export class ConsentScanRefDoc implements ConsentScanRef {
  @ApiProperty({ description: 'Binary id of the scan (3.10)' })
  readonly id!: string;

  @ApiProperty({ example: 'application/pdf' })
  readonly contentType!: string;

  @ApiProperty({ description: 'SHA-1 of the scan, base64 (Consent.sourceAttachment.hash)' })
  readonly hash!: string;
}

export class ConsentPerformerDoc {
  @ApiProperty({ enum: ['Patient', 'RelatedPerson'] })
  readonly type!: 'Patient' | 'RelatedPerson';

  @ApiProperty({ description: 'Id of the signing Patient or RelatedPerson' })
  readonly id!: string;
}

export class ConsentPeriodDoc {
  @ApiPropertyOptional({ description: 'Consent.provision.period.start', example: '2026-10-01' })
  readonly start?: string;

  @ApiPropertyOptional({ description: 'Consent.provision.period.end (the revocation date)', example: '2026-10-20' })
  readonly end?: string;
}

/** Swagger projection of `ConsentResponse` (API §3.4–3.9). */
export class ConsentResponseDoc implements ConsentResponse {
  @ApiProperty({ description: 'Consent.id (FHIR id)' })
  readonly id!: string;

  @ApiProperty({ enum: CONSENT_STATUSES, enumName: 'ConsentStatus' })
  readonly status!: ConsentStatus;

  @ApiPropertyOptional({ description: 'Number of the paper form (Consent.identifier)' })
  readonly formNumber?: string;

  @ApiProperty({ description: 'Consent.dateTime', example: '2026-10-01' })
  readonly signedAt!: string;

  @ApiPropertyOptional({ enum: CONSENTER_TYPES, enumName: 'ConsenterType' })
  readonly consenterType?: ConsenterType;

  @ApiProperty({ type: ConsentPerformerDoc })
  readonly performer!: ConsentPerformerDoc;

  @ApiPropertyOptional({ description: 'Name of the clerk who entered the form' })
  readonly signedBy?: string;

  @ApiPropertyOptional({ description: 'Document of the representative authority' })
  readonly representativeDocument?: string;

  @ApiPropertyOptional({ type: ConsentScanRefDoc })
  readonly scan?: ConsentScanRefDoc;

  @ApiProperty({ type: ConsentPeriodDoc })
  readonly period!: ConsentPeriodDoc;

  @ApiPropertyOptional({ description: 'Number of the written application that revoked the consent' })
  readonly revocationNumber?: string;

  @ApiPropertyOptional({ description: 'When the entry was recorded (RFC 3339)', format: 'date-time' })
  readonly recordedAt?: string;
}

/** Swagger projection of `PatientConsentResponse` (API §3.4, 3.7). */
export class PatientConsentResponseDoc implements PatientConsentResponse {
  @ApiProperty({ type: ConsentResponseDoc, nullable: true, description: 'The consent in force, or null' })
  readonly active!: ConsentResponseDoc | null;

  @ApiProperty({ type: [ConsentResponseDoc], description: 'Newest first, including the active one' })
  readonly history!: readonly ConsentResponseDoc[];
}

/** Swagger projection of `ConsentScanUploadResponse` (API §3.10). */
export class ConsentScanUploadResponseDoc implements ConsentScanUploadResponse {
  @ApiProperty({ description: 'Binary id; pass it as scanId to 3.8' })
  readonly scanId!: string;

  @ApiProperty({ example: 'application/pdf' })
  readonly contentType!: string;

  @ApiProperty({ description: 'Size in bytes', example: 120345 })
  readonly size!: number;

  @ApiProperty({ description: 'SHA-1, base64' })
  readonly hash!: string;
}

/** multipart/form-data body of 3.10. */
export class ConsentScanUploadBodyDoc {
  @ApiProperty({ type: 'string', format: 'binary', description: 'PDF, JPEG or PNG up to 10 MB (type checked by signature)' })
  readonly file!: unknown;
}
