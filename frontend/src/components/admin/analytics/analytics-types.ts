/** One group of a `MeasureReport`-derived answer (api-designer-spec §9.1–9.3). */
export interface MeasureGroup {
  /** The `Appointment.status`, a specialty code or a `HealthcareService` id, depending on the report. */
  readonly code: string;
  readonly system?: string;
  readonly display?: string;
  readonly count: number;
}

export interface MeasureReport {
  readonly measure: string;
  readonly scoring: 'cohort';
  readonly period: { readonly start: string; readonly end: string };
  /** Sum of the groups: every subject is counted in exactly one group. */
  readonly total: number;
  readonly groups: ReadonlyArray<MeasureGroup>;
}

/** 9.1 also carries the flat `booked` / `fulfilled` / `cancelled` / `noshow` counters next to `groups`. */
export interface AppointmentsReport extends MeasureReport {
  readonly booked?: number;
  /** Attended visits; absent in answers of a service that predates the group. */
  readonly fulfilled?: number;
  readonly cancelled?: number;
  readonly noshow?: number;
}

export type AppointmentStatusCode = 'booked' | 'fulfilled' | 'cancelled' | 'noshow';

export const APPOINTMENT_STATUSES: ReadonlyArray<AppointmentStatusCode> = ['booked', 'fulfilled', 'cancelled', 'noshow'];

/** The service answers 1…50 (`top`, default 10). */
export const TOP_OPTIONS: ReadonlyArray<number> = [5, 10, 20, 50];
export const DEFAULT_TOP = 10;
