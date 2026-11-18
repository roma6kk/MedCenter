import type { ServiceSlotDto } from '../slot-search';

export interface DoctorSlotsResponseDto {
  readonly doctorId: string;
  readonly from: string;
  readonly to: string;
  readonly items: readonly ServiceSlotDto[];
  readonly truncated?: true;
}
