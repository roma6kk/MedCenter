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
  /** RFC 3339 instant; appointments booked before that fix carry only the day (`YYYY-MM-DD`). */
  readonly createdAt: string;
  readonly doctorName?: string;
  readonly serviceName?: string;
  readonly patientName?: string;
}

/** `upcoming` is the booked visits from now on, soonest first; `all` is the whole history, newest first. */
export type AppointmentTab = 'upcoming' | 'all';

/** Only a booked appointment can be cancelled (BR-002); the server still has the last word (409 `APPOINTMENT_NOT_CANCELLABLE`). */
export function isCancellable(status: AppointmentStatus): boolean {
  return status === 'booked';
}
