import type { CodingDto, DiagnosisViewDto, EncounterStatus } from '../../encounters/dto/encounter-response.dto';

/**
 * One visit of the patient's history (API §7.4/7.6): a finished encounter with
 * its diagnoses, summary and recommendations. `date` and `diagnosis` (the
 * primary ICD-10 code) are what the history timeline renders; the rest lets a
 * client expand the entry without another request.
 */
export interface HistoryItemDto {
  /** Encounter id. */
  readonly id: string;
  /** `Encounter.period.start`. */
  readonly date: string;
  readonly endDate?: string;
  readonly status: EncounterStatus;
  /** Primary ICD-10 code (`Encounter.diagnosis` rank 1), `''` when the encounter has none. */
  readonly diagnosis: string;
  readonly diagnoses: readonly DiagnosisViewDto[];
  readonly summary?: string;
  readonly recommendations?: string;
  readonly serviceType?: CodingDto;
  readonly appointmentId: string;
  readonly practitionerRoleId: string;
}
