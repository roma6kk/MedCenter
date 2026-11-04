import type { DomainEventBase } from './domain-event-base';

/**
 * The doctor recorded that the patient did not come (BR-008, API §6.6). Minimised like
 * `appointment.cancelled.v1` (ADR-021): the ids are all the notification needs.
 */
export interface AppointmentNoShowEvent extends DomainEventBase {
  readonly type: 'appointment.noshow.v1';
  readonly appointmentId: string;
  readonly patientRef: string;
}
