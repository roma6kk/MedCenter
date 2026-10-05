import type { DomainEventBase } from './domain-event-base';

export interface AppointmentBookedEvent extends DomainEventBase {
  readonly type: 'appointment.booked.v1';
  readonly appointmentId: string;
  readonly patientRef: string;
  readonly practitionerRoleRef: string;
  readonly slotRef: string;
  readonly start: string;
  readonly serviceId: string;
}