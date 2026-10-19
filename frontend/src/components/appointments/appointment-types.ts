/**
 * appointment-types — the appointment as appointment-service answers on 6.2/6.3 (`AppointmentViewDto`).
 *
 * `doctorName`, `serviceName` and `patientName` come from the same FHIR search as the appointment; they are absent, not
 * wrong, when a related resource is missing, so the UI always has a fallback text for them.
 */
import type { AppointmentStatus } from '@/components/feedback/stamp-badge';

export type { AppointmentStatus };

export interface AppointmentView {
  readonly id: string;
  readonly status: AppointmentStatus;
  /** RFC 3339 UTC. */
  readonly start: string;
  readonly end: string;
  readonly slotId: string;
  readonly patientId: string;
  readonly doctorId: string;
  readonly practitionerRoleId: string;
  readonly serviceId: string;
  /** What the patient wrote when booking. */
  readonly reason?: string;
  /** `statusReason` of a cancelled appointment (BR-002). */
  readonly cancelReason?: string;
  /** A calendar day (`YYYY-MM-DD`), not an instant. */
  readonly createdAt: string;
  readonly doctorName?: string;
  readonly serviceName?: string;
  readonly patientName?: string;
}

/** `upcoming` starts now or later, soonest first; `all` is the whole history, newest first. */
export type AppointmentTab = 'upcoming' | 'all';

/** Only a booked appointment can be cancelled (BR-002); the server still has the last word (409 `APPOINTMENT_NOT_CANCELLABLE`). */
export function isCancellable(status: AppointmentStatus): boolean {
  return status === 'booked';
}

/**
 * The list of "upcoming" also holds cancelled appointments (API 6.2 has no status filter), which would bury the real
 * bookings. Within one page the cancelled ones go last, each group keeps the server's order; paging stays the server's.
 */
export function activeFirst(items: ReadonlyArray<AppointmentView>): ReadonlyArray<AppointmentView> {
  return [...items.filter((item) => item.status !== 'cancelled'), ...items.filter((item) => item.status === 'cancelled')];
}
