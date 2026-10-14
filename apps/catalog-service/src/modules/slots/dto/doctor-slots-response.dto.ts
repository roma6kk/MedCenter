import type { SlotResponseDto } from '@medcenter/fhir-mappers';

/**
 * API §5.2.8 response. No pagination (the range is capped at 31 days), slots
 * sorted by `start`; `items` keeps the list envelope shape of API §0.
 */
export interface DoctorSlotsResponseDto {
  readonly doctorId: string;
  readonly from: string;
  readonly to: string;
  readonly items: readonly SlotResponseDto[];
  /**
   * Present (and `true`) only when the slot search hit its page cap, so later
   * days may be missing. Absent on every normal answer.
   */
  readonly truncated?: true;
}
