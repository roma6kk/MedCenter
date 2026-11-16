import type { AppointmentStatus } from '@/components/feedback/stamp-badge';
import { normalizeDoctorName } from '@/lib/doctor-name';

export interface AppointmentView {
  readonly id: string;
  readonly status: AppointmentStatus;
  readonly start: string;
  readonly end: string;
  readonly slotId: string;
  readonly patientId: string;
  readonly doctorId: string;
  readonly practitionerRoleId: string;
  readonly serviceId: string;
  readonly cancelReason?: string;
  readonly createdAt: string;
  readonly doctorName?: string;
  readonly serviceName?: string;
  readonly patientName?: string;
}

export type AppointmentTab = 'upcoming' | 'all';

export function isCancellable(status: AppointmentStatus): boolean {
  return status === 'booked';
}

/** The API refuses a patient's cancel after the start (APPOINTMENT_ALREADY_STARTED); an admin may still cancel. */
export function isCancellableByPatient(appointment: Pick<AppointmentView, 'status' | 'start'>): boolean {
  return isCancellable(appointment.status) && Date.parse(appointment.start) > Date.now();
}

export function doctorOf(appointment: Pick<AppointmentView, 'doctorName'>, fallback: string): string {
  const name: string = normalizeDoctorName(appointment.doctorName);
  return name === '' ? fallback : name;
}
