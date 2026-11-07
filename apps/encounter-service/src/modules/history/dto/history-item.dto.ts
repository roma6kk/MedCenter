import type { CodingDto, DiagnosisViewDto, EncounterStatus } from '../../encounters/dto/encounter-response.dto';

export interface HistoryItemDto {
  readonly id: string;
  readonly date: string;
  readonly endDate?: string;
  readonly status: EncounterStatus;
  readonly diagnosis: string;
  readonly diagnoses: readonly DiagnosisViewDto[];
  readonly summary?: string;
  readonly recommendations?: string;
  readonly serviceType?: CodingDto;
  readonly appointmentId: string;
  readonly practitionerRoleId: string;
  readonly doctorName?: string;
}
