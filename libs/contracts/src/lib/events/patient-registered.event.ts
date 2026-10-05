import type { DomainEventBase } from './domain-event-base';

export interface PatientRegisteredEvent extends DomainEventBase {
  readonly type: 'patient.registered.v1';
  readonly patientId: string;
  readonly email: string;
}