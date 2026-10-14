import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EncounterCompletedEvent } from '@medcenter/contracts';
import { EVENT_PUBLISHER, type EventPublisher } from '@medcenter/messaging';

export type EncounterCompletedPayload = Omit<EncounterCompletedEvent, 'v' | 'eventId' | 'occurredAt' | 'type'>;

/**
 * Builds the `encounter.completed.v1` envelope (architect §4.4) and hands it to
 * the broker. Publishing runs after the FHIR transaction has committed, so a
 * failure cannot undo the completion: it is logged, not rethrown — answering
 * 5xx for a committed completion would invite a replay that can only end in
 * `409 ENCOUNTER_STATE_INVALID`. No transactional outbox yet (as in M3).
 */
@Injectable()
export class EncounterPublisherService {
  private readonly logger = new Logger(EncounterPublisherService.name);

  constructor(@Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher) {}

  async publishCompleted(payload: EncounterCompletedPayload): Promise<void> {
    const event: EncounterCompletedEvent = {
      ...payload,
      v: 1,
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      type: 'encounter.completed.v1',
    };
    try {
      await this.publisher.publish(event);
    } catch (error) {
      this.logger.error(
        { err: error, type: event.type, eventId: event.eventId, encounterId: event.encounterId },
        'domain event was not published; the committed encounter state is unchanged',
      );
    }
  }
}
