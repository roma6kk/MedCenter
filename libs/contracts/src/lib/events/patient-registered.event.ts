import type { DomainEventBase } from './domain-event-base';

export interface PatientRegisteredEvent extends DomainEventBase {
  readonly type: 'patient.registered.v1';
  readonly patientId: string;
  /**
   * Optional and no longer sent (ADR-021, payload minimisation): no consumer reads it and it is contact data
   * that must not sit in the outbox. Old events that carry it remain valid.
   */
  readonly email?: string;
}