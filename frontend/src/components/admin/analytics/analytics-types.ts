export interface MeasureGroup {
  readonly code: string;
  readonly system?: string;
  readonly display?: string;
  readonly count: number;
}

export interface MeasureReport {
  readonly measure: string;
  readonly scoring: 'cohort';
  readonly period: { readonly start: string; readonly end: string };
  readonly total: number;
  readonly groups: ReadonlyArray<MeasureGroup>;
}

export interface AppointmentsReport extends MeasureReport {
  readonly booked?: number;
  readonly fulfilled?: number;
  readonly cancelled?: number;
  readonly noshow?: number;
}

export type AppointmentStatusCode = 'booked' | 'fulfilled' | 'cancelled' | 'noshow';

export const APPOINTMENT_STATUSES: ReadonlyArray<AppointmentStatusCode> = ['booked', 'fulfilled', 'cancelled', 'noshow'];

export const TOP_OPTIONS: ReadonlyArray<number> = [5, 10, 20, 50];
export const DEFAULT_TOP = 10;
