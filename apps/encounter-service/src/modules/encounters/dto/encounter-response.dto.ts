import type { DiagnosisVerificationStatus } from './condition.dto';

export type EncounterStatus =
  | 'planned'
  | 'arrived'
  | 'triaged'
  | 'in-progress'
  | 'onleave'
  | 'finished'
  | 'cancelled'
  | 'entered-in-error'
  | 'unknown';

export interface EncounterPeriodDto {
  readonly start: string;
  readonly end?: string;
}

/**
 * API §7.3 response `{ id; status; period; diagnosisCodes }`, plus the ids a
 * client needs to navigate (all bare FHIR ids, as in `AppointmentResponseDto`).
 */
export interface EncounterResponseDto {
  readonly id: string;
  readonly status: EncounterStatus;
  readonly period: EncounterPeriodDto;
  readonly diagnosisCodes: readonly string[];
  readonly appointmentId: string;
  readonly patientId: string;
  readonly practitionerRoleId: string;
}

export interface DiagnosisViewDto {
  readonly code: string;
  readonly display: string;
  readonly verificationStatus?: DiagnosisVerificationStatus;
}

export interface ObservationViewDto {
  readonly codeSystem: string;
  readonly code: string;
  readonly display?: string;
  readonly value: number;
  readonly unit: string;
}

export interface ServiceRequestViewDto {
  readonly codeSystem: string;
  readonly code: string;
  readonly display?: string;
  readonly note?: string;
}

export interface MedicationRequestViewDto {
  readonly atcCode: string;
  readonly atcDisplay?: string;
  readonly dosageText: string;
  readonly note?: string;
}

export interface CodingDto {
  readonly system?: string;
  readonly code?: string;
  readonly display?: string;
}

/**
 * API §7.2 — the encounter plus, once finished, its clinical content in the
 * field names of `CompleteEncounterDto`, so the doctor's read-only form can be
 * filled from it as is.
 */
export interface EncounterDetailsDto extends EncounterResponseDto {
  readonly serviceType?: CodingDto;
  readonly summary?: string;
  readonly recommendations?: string;
  readonly diagnoses: readonly DiagnosisViewDto[];
  readonly observations: readonly ObservationViewDto[];
  readonly serviceRequests: readonly ServiceRequestViewDto[];
  readonly medicationRequests: readonly MedicationRequestViewDto[];
}

/** Result of API §7.1: `created=false` when the appointment already had an open encounter. */
export interface OpenEncounterResult {
  readonly created: boolean;
  readonly encounter: EncounterResponseDto;
}
