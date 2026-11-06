import type { DomainEventBase } from './domain-event-base';

export type AppointmentActorType = 'PATIENT' | 'ADMIN';

export interface AppointmentCancelledEvent extends DomainEventBase {
  readonly type: 'appointment.cancelled.v1';
  readonly appointmentId: string;
  readonly patientRef: string;
  /** No longer sent (ADR-021, payload minimisation); old events that carry it stay valid. */
  readonly reason?: string;
  readonly actorType: AppointmentActorType;
}