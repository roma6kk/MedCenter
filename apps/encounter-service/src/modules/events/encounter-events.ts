import { randomUUID } from 'node:crypto';
import type { EncounterCompletedEvent } from '@medcenter/contracts';

type CompletedPayload = Omit<EncounterCompletedEvent, 'v' | 'eventId' | 'occurredAt' | 'type' | 'diagnoses'>;

/**
 * The `encounter.completed.v1` envelope. It is not published here: the service records it as an outbox entry
 * in the completion transaction and `outbox-relay` publishes it (ADR-021). A fresh `eventId` is the consumers'
 * dedup key.
 *
 * Payload minimisation (ADR-021): no `diagnoses`. Codes and names are health data and stay in the `Condition`
 * resources; the only consumer that looked at them (analytics) needs the count, which `diagnosisCount` carries.
 */
export function completedEvent(payload: CompletedPayload): EncounterCompletedEvent {
  return { ...payload, v: 1, eventId: randomUUID(), occurredAt: new Date().toISOString(), type: 'encounter.completed.v1' };
}
