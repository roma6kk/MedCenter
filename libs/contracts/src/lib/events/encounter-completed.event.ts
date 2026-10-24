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
  /**
   * Optional and no longer sent (ADR-021, payload minimisation): codes and names are health data and stay
   * in the `Condition` resources. Old events that carry the list remain valid.
   */
  readonly diagnoses?: EncounterDiagnosis[];
  /**
   * How many diagnoses the encounter was closed with; all the analytics read-model needs. Optional so that
   * events published before it existed stay valid (consumers fall back to `diagnoses.length`).
   */
  readonly diagnosisCount?: number;
}