import type { SlotResponseDto } from '@medcenter/fhir-mappers';

/** One weekly working window as stored on the schedule (local clinic time). */
export interface WeeklyWindowView {
  readonly dayOfWeek: 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';
  readonly startTime: string;
  readonly endTime: string;
}

/** A `Schedule` as the doctor sees it: weekly windows MO–SU plus its actors. */
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

/**
 * A slot of the doctor's own schedule: the `SlotResponseDto` of API §5.2.8
 * plus a ready-to-render clinic-time `label` (`02.11.2026 12:00–12:30 · занят`)
 * — the list shape `DoctorScheduleView` consumes (`items[].id` / `items[].label`).
 */
export interface DoctorScheduleSlotDto extends SlotResponseDto {
  readonly label: string;
}

/**
 * API §5.2.7 response — the signed-in doctor's schedules and their slots
 * (free and busy) inside the range, `items` sorted by `start`.
 */
export interface DoctorScheduleResponseDto {
  readonly practitionerRoleId: string;
  readonly from: string;
  readonly to: string;
  readonly schedules: readonly ScheduleSummaryDto[];
  readonly items: readonly DoctorScheduleSlotDto[];
  /** Present (and `true`) only when the slot search hit its page cap, so later slots may be missing. */
  readonly truncated?: true;
}
