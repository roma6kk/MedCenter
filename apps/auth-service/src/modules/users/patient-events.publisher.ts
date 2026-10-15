import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PatientRegisteredEvent } from '@medcenter/contracts';
import { EVENT_PUBLISHER, type EventPublisher } from '@medcenter/messaging';

/**
 * Publishes `patient.registered.v1` (architect §4.4) after the registration
 * has committed. Like appointment-service, a broker failure is logged and not
 * rethrown: answering 5xx for an account that already exists would invite a
 * retry that can only end in `409 EMAIL_TAKEN`. There is no transactional
 * outbox yet; the gap is recorded in the coder report.
 */
@Injectable()
export class PatientEventsPublisher {
  private readonly logger = new Logger(PatientEventsPublisher.name);

  constructor(@Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher) {}

  async publishRegistered(patientId: string, email: string): Promise<void> {
    const event: PatientRegisteredEvent = {
      v: 1,
      type: 'patient.registered.v1',
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      patientId,
      email,
    };
    try {
      await this.publisher.publish(event);
    } catch (error: unknown) {
      this.logger.error(
        { err: error, type: event.type, eventId: event.eventId, patientId },
        'domain event was not published; the committed registration is unchanged',
      );
    }
  }
}
