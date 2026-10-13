import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AppointmentBookedEvent, AppointmentCancelledEvent } from '@medcenter/contracts';
import { EVENT_PUBLISHER, type DomainEvent, type EventPublisher } from '@medcenter/messaging';

type BookedPayload = Omit<AppointmentBookedEvent, 'v' | 'eventId' | 'occurredAt' | 'type'>;
type CancelledPayload = Omit<AppointmentCancelledEvent, 'v' | 'eventId' | 'occurredAt' | 'type'>;

/**
 * Builds the `appointment.*.v1` envelopes and hands them to the broker.
 *
 * Publishing runs after the FHIR transaction has committed, so a failure here
 * cannot undo the booking. It is logged, not rethrown: answering the client
 * with a 5xx for a committed booking would invite a retry on a slot that is
 * already taken. The gap (no transactional outbox yet) is recorded in
 * `coder-m3-booking-spec.md`.
 */
@Injectable()
export class AppointmentPublisherService {
  private readonly logger = new Logger(AppointmentPublisherService.name);

  constructor(@Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher) {}

  async publishBooked(payload: BookedPayload): Promise<void> {
    await this.send({ ...payload, v: 1, eventId: randomUUID(), occurredAt: new Date().toISOString(), type: 'appointment.booked.v1' });
  }

  async publishCancelled(payload: CancelledPayload): Promise<void> {
    await this.send({ ...payload, v: 1, eventId: randomUUID(), occurredAt: new Date().toISOString(), type: 'appointment.cancelled.v1' });
  }

  private async send(event: DomainEvent): Promise<void> {
    try {
      await this.publisher.publish(event);
    } catch (error) {
      this.logger.error({ err: error, type: event.type, eventId: event.eventId }, 'domain event was not published; the committed booking state is unchanged');
    }
  }
}
