import type { SlotStatus } from '@/components/feedback/stamp-badge';

export const WEEK_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

/** `WeeklyWindowDto`: a working window of one weekday in clinic local time (`HH:mm`). */
export interface WeeklyWindow {
  readonly dayOfWeek: WeekDay;
  readonly startTime: string;
  readonly endTime: string;
}

/** `ScheduleSummaryDto` of `GET /api/v1/admin/schedules`. A broken leftover schedule may lack any of the optional fields. */
export interface AdminSchedule {
  readonly id: string;
  readonly isActive: boolean;
  readonly practitionerRoleId?: string;
  readonly roomId?: string;
  readonly serviceId?: string;
  readonly horizonFrom?: string;
  readonly horizonTo?: string;
  readonly slotDurationMin?: number;
  readonly windows: ReadonlyArray<WeeklyWindow>;
  readonly comment?: string;
}

/** `CreateScheduleDto` (api-designer-spec §5.2.1). */
export interface CreateSchedulePayload {
  readonly practitionerRoleId: string;
  readonly roomId: string;
  readonly serviceId: string;
  readonly horizonFrom: string;
  readonly horizonTo: string;
  readonly windows: ReadonlyArray<WeeklyWindow>;
  readonly slotDurationMin: number;
  readonly comment?: string;
}

/** `UpdateScheduleDto` (§5.2.3): windows, horizon, duration and comment can change; the actors cannot. */
export interface UpdateSchedulePayload {
  readonly horizonFrom: string;
  readonly horizonTo: string;
  readonly windows: ReadonlyArray<WeeklyWindow>;
  readonly slotDurationMin: number;
  readonly comment?: string;
}

/** `GenerateSlotsDto` (§5.2.5). */
export interface GenerateSlotsPayload {
  readonly from: string;
  readonly to: string;
}

export interface GenerateSlotsResult {
  readonly generated: number;
  readonly skipped: number;
}

/** `SlotResponseDto` (§5.2.8). */
export interface ScheduleSlot {
  readonly id: string;
  readonly scheduleId: string;
  readonly start: string;
  readonly end: string;
  readonly status: SlotStatus;
}
