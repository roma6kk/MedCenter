import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { DiagnosisVerificationStatus } from './condition.dto';
import { VERIFICATION_STATUSES } from './condition.dto';
import type {
  CodingDto,
  DiagnosisViewDto,
  EncounterDetailsDto,
  EncounterPeriodDto,
  EncounterResponseDto,
  EncounterStatus,
  MedicationRequestViewDto,
  ObservationViewDto,
  ServiceRequestViewDto,
} from './encounter-response.dto';

/** FHIR R4 `Encounter.status` value set. */
export const ENCOUNTER_STATUSES: readonly EncounterStatus[] = [
  'planned',
  'arrived',
  'triaged',
  'in-progress',
  'onleave',
  'finished',
  'cancelled',
  'entered-in-error',
  'unknown',
];

export class EncounterPeriodDoc implements EncounterPeriodDto {
  @ApiProperty({ type: String, format: 'date-time', example: '2026-10-20T08:00:00Z' })
  start!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', example: '2026-10-20T08:30:00Z' })
  end?: string;
}

export class CodingDoc implements CodingDto {
  @ApiPropertyOptional({ example: 'https://fhir.by/CodeSystem/nsi-services' })
  system?: string;

  @ApiPropertyOptional({ example: '1000' })
  code?: string;

  @ApiPropertyOptional()
  display?: string;
}

export class DiagnosisViewDoc implements DiagnosisViewDto {
  @ApiProperty({ example: 'J06.9' })
  code!: string;

  @ApiProperty({ example: 'Острый назофарингит' })
  display!: string;

  @ApiPropertyOptional({ enum: VERIFICATION_STATUSES, enumName: 'DiagnosisVerificationStatus' })
  verificationStatus?: DiagnosisVerificationStatus;
}

export class ObservationViewDoc implements ObservationViewDto {
  @ApiProperty({ example: 'https://fhir.by/CodeSystem/nsi-observations' })
  codeSystem!: string;

  @ApiProperty({ example: '50849' })
  code!: string;

  @ApiPropertyOptional()
  display?: string;

  @ApiProperty({ example: 36.6 })
  value!: number;

  @ApiProperty({ description: 'UCUM unit', example: 'Cel' })
  unit!: string;
}

export class ServiceRequestViewDoc implements ServiceRequestViewDto {
  @ApiProperty({ example: 'https://fhir.by/CodeSystem/nsi-services' })
  codeSystem!: string;

  @ApiProperty()
  code!: string;

  @ApiPropertyOptional()
  display?: string;

  @ApiPropertyOptional()
  note?: string;
}

export class MedicationRequestViewDoc implements MedicationRequestViewDto {
  @ApiProperty({ example: 'J01FA10' })
  atcCode!: string;

  @ApiPropertyOptional()
  atcDisplay?: string;

  @ApiProperty({ example: '1 таб 3 раза в день после еды' })
  dosageText!: string;

  @ApiPropertyOptional()
  note?: string;
}

/** Swagger description of `EncounterResponseDto` (API §7.1, §7.3). */
export class EncounterResponseDoc implements EncounterResponseDto {
  @ApiProperty({ description: 'Encounter id (FHIR id)', example: '1234' })
  id!: string;

  @ApiProperty({ enum: ENCOUNTER_STATUSES, enumName: 'EncounterStatus', example: 'finished' })
  status!: EncounterStatus;

  @ApiProperty({ type: EncounterPeriodDoc })
  period!: EncounterPeriodDoc;

  @ApiProperty({ type: String, isArray: true, description: 'ICD-10 codes of the diagnoses', example: ['J06.9'] })
  diagnosisCodes!: string[];

  @ApiProperty({ description: 'Appointment id (FHIR id)' })
  appointmentId!: string;

  @ApiProperty({ description: 'Patient id (FHIR id)' })
  patientId!: string;

  @ApiProperty({ description: 'PractitionerRole id (FHIR id)' })
  practitionerRoleId!: string;
}

/** Swagger description of `EncounterDetailsDto` (API §7.2). */
export class EncounterDetailsDoc extends EncounterResponseDoc implements EncounterDetailsDto {
  @ApiPropertyOptional({ type: CodingDoc })
  serviceType?: CodingDoc;

  @ApiPropertyOptional({ description: 'ClinicalImpression.summary, once finished' })
  summary?: string;

  @ApiPropertyOptional({ description: 'CarePlan.description, once finished' })
  recommendations?: string;

  @ApiProperty({ type: [DiagnosisViewDoc] })
  diagnoses!: DiagnosisViewDoc[];

  @ApiProperty({ type: [ObservationViewDoc] })
  observations!: ObservationViewDoc[];

  @ApiProperty({ type: [ServiceRequestViewDoc] })
  serviceRequests!: ServiceRequestViewDoc[];

  @ApiProperty({ type: [MedicationRequestViewDoc] })
  medicationRequests!: MedicationRequestViewDoc[];
}
