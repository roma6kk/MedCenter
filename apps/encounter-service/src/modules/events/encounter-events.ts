import { randomUUID } from 'node:crypto';
import type { EncounterCompletedEvent } from '@medcenter/contracts';

type CompletedPayload = Omit<EncounterCompletedEvent, 'v' | 'eventId' | 'occurredAt' | 'type' | 'diagnoses'>;

export function completedEvent(payload: CompletedPayload): EncounterCompletedEvent {
  return { ...payload, v: 1, eventId: randomUUID(), occurredAt: new Date().toISOString(), type: 'encounter.completed.v1' };
}
