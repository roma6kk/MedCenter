import type { DomainEventBase } from './domain-event-base';

export type AppointmentActorType = 'PATIENT' | 'ADMIN';

export interface AppointmentCancelledEvent extends DomainEventBase {
  readonly type: 'appointment.cancelled.v1';
  readonly appointmentId: string;
  readonly patientRef: string;
  /**
   * Free-text reason. Optional and no longer sent (ADR-021, payload minimisation): the reason is health
   * data and stays in `Appointment.cancelationReason`. Old events that carry it remain valid.
   */
  readonly reason?: string;
  readonly actorType: AppointmentActorType;
}