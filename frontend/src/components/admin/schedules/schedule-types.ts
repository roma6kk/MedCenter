import type { SlotStatus } from '@/components/feedback/stamp-badge';

export const WEEK_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

export interface WeeklyWindow {
  readonly dayOfWeek: WeekDay;
  readonly startTime: string;
  readonly endTime: string;
}

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

export interface UpdateSchedulePayload {
  readonly horizonFrom: string;
  readonly horizonTo: string;
  readonly windows: ReadonlyArray<WeeklyWindow>;
  readonly slotDurationMin: number;
  readonly comment?: string;
}

export interface GenerateSlotsPayload {
  readonly from: string;
  readonly to: string;
}

export interface GenerateSlotsResult {
  readonly generated: number;
  readonly skipped: number;
}

export interface ScheduleSlot {
  readonly id: string;
  readonly scheduleId: string;
  readonly start: string;
  readonly end: string;
  readonly status: SlotStatus;
}
