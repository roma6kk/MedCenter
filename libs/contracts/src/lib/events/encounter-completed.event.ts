import type { DomainEventBase } from './domain-event-base';

export interface EncounterDiagnosis {
  readonly code: string;
  readonly display: string;
}

export interface EncounterCompletedEvent extends DomainEventBase {
  readonly type: 'encounter.completed.v1';
  readonly encounterId: string;
  readonly patientRef: string;
  readonly practitionerRef: string;
  readonly diagnoses: EncounterDiagnosis[];
}