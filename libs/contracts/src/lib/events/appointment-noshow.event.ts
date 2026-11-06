import type { DomainEventBase } from './domain-event-base';

export interface AppointmentNoShowEvent extends DomainEventBase {
  readonly type: 'appointment.noshow.v1';
  readonly appointmentId: string;
  readonly patientRef: string;
}
