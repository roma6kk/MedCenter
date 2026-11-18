import type { SlotResponseDto } from '@medcenter/fhir-mappers';

export interface WeeklyWindowView {
  readonly dayOfWeek: 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';
  readonly startTime: string;
  readonly endTime: string;
}

export interface ScheduleSummaryDto {
  readonly id: string;
  readonly isActive: boolean;
  readonly practitionerRoleId?: string;
  readonly roomId?: string;
  readonly serviceId?: string;
  readonly horizonFrom?: string;
  readonly horizonTo?: string;
  readonly slotDurationMin?: number;
  readonly windows: readonly WeeklyWindowView[];
  readonly comment?: string;
}

export interface DoctorScheduleSlotDto extends SlotResponseDto {
  readonly serviceId?: string;
  readonly label: string;
}

export interface DoctorScheduleResponseDto {
  readonly practitionerRoleId: string;
  readonly from: string;
  readonly to: string;
  readonly schedules: readonly ScheduleSummaryDto[];
  readonly items: readonly DoctorScheduleSlotDto[];
  readonly truncated?: true;
}
