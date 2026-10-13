import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { connect, type Channel, type ChannelModel, type ConsumeMessage } from 'amqplib';
import { FHIR_CLIENT, FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';
import { bindQueueWithDlq, retryQueueOf, type DomainEvent } from '@medcenter/messaging';

import { communicationFromEvent } from './communication.mapper';
import { DeduplicationService, EventInProgressError } from './deduplication.service';
import { NOTIFICATION_BINDINGS } from './notification.bindings';

const RECONNECT_DELAY_MS = 5_000;
const PREFETCH = 10;

function isDomainEvent(value: unknown): value is DomainEvent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate['type'] === 'string' && typeof candidate['eventId'] === 'string';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * RabbitMQ consumer (FR-008). Each queue is bound to its routing key with a
 * dead-letter queue. A message is acked after its `Communication` is written.
 * A malformed message or a failed write is rejected without requeue, which
 * sends it to `<queue>.dlq` for inspection instead of an endless redelivery loop.
 *
 * The consumer runs a reconnect loop: whenever the connection ends (error or
 * close) it waits `RECONNECT_DELAY_MS` and connects again. An unreachable broker
 * does not stop the HTTP endpoints from serving. `CONSUMER_ENABLED=false`
 * turns the consumer off (used by the e2e suite).
 *
 * Every promise started here has a handler: a broker that drops mid-message
 * must not produce an unhandled rejection.
 */
@Injectable()
export class ConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConsumerService.name);
  private connection?: ChannelModel;
  private stopped = false;

  constructor(
    @Inject(FHIR_CLIENT) private readonly fhir: FhirClient,
    private readonly dedup: DeduplicationService,
  ) {}

  onModuleInit(): void {
    if (process.env['CONSUMER_ENABLED'] === 'false') {
      return;
    }
    void this.consumeForever().catch((error: unknown) => {
      this.logger.error({ err: error }, 'notification consumer stopped unexpectedly');
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    await this.connection?.close().catch((error: unknown) => {
      this.logger.warn({ err: error }, 'RabbitMQ connection did not close cleanly');
    });
  }

  /**
   * Handles one domain event. A duplicate of a finished event is acknowledged
   * silently; a duplicate arriving while the first copy is still being written
   * throws `EventInProgressError` so it is deferred to the retry queue (acking it would drop the
   * event if that first write then fails). Unknown event types are ignored; a
   * failed write releases the dedup claim and rethrows so the message is dead-lettered.
   */
  async handle(event: DomainEvent): Promise<void> {
    const communication = communicationFromEvent(event);
    if (communication === undefined) {
      this.logger.warn({ type: event.type, eventId: event.eventId }, 'no notification for this event type');
      return;
    }
    const claim = await this.dedup.claim(event.eventId);
    if (claim === 'done') {
      return;
    }
    if (claim === 'in-progress') {
      throw new EventInProgressError(event.eventId);
    }
    try {
      await this.writeOnce(communication);
      await this.dedup.complete(event.eventId);
    } catch (error) {
      await this.dedup.release(event.eventId);
      throw error;
    }
  }

  /**
   * Deterministic write. The id derives from the `eventId`, so a redelivery
   * targets the same resource. An existing resource (already written, possibly
   * already read by the patient) is left untouched, never overwritten.
   */
  private async writeOnce(communication: FhirResource): Promise<void> {
    const id = communication.id ?? '';
    if (await this.exists(id)) {
      return;
    }
    await this.fhir.update('Communication', id, communication);
  }

  private async exists(id: string): Promise<boolean> {
    try {
      await this.fhir.read('Communication', id);
      return true;
    } catch (error) {
      if (error instanceof FhirClientError && error.getStatus() === 404) {
        return false;
      }
      throw error;
    }
  }

  private async consumeForever(): Promise<void> {
    const url = process.env['RABBITMQ_URL'];
    if (url === undefined || url === '') {
      this.logger.error('RABBITMQ_URL is not configured; notification consumer is not running');
      return;
    }
    while (!this.stopped) {
      try {
        await this.consumeUntilClosed(url);
      } catch (error) {
        this.logger.warn({ err: error }, `RabbitMQ unavailable; retrying in ${RECONNECT_DELAY_MS} ms`);
      }
      if (!this.stopped) {
        await sleep(RECONNECT_DELAY_MS);
      }
    }
  }

  /**
   * Opens a connection, binds every queue and consumes until the connection
   * ends. Resolves when it ends, so the caller reconnects. Rejects only if the
   * initial setup fails.
   */
  private async consumeUntilClosed(url: string): Promise<void> {
    const connection = await connect(url);
    if (this.stopped) {
      // Shutdown began while the connection was being opened: close it instead of consuming.
      await connection.close().catch(() => undefined);
      return;
    }
    this.connection = connection;
    const ended = new Promise<void>((resolve) => {
      connection.on('error', (error: unknown) => {
        this.logger.warn({ err: error }, 'RabbitMQ connection error');
        resolve();
      });
      connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        resolve();
      });
    });
    try {
      const channel = await connection.createChannel();
      channel.on('error', (error: unknown) => {
        this.logger.warn({ err: error }, 'RabbitMQ channel error; closing connection to reconnect');
        connection.close().catch(() => undefined);
      });
      await channel.prefetch(PREFETCH);
      for (const binding of NOTIFICATION_BINDINGS) {
        await bindQueueWithDlq(channel, binding.queue, binding.routingKey);
        await channel.consume(binding.queue, (message) => {
          if (message === null) {
            // Broker cancelled this consumer: end the connection so the reconnect loop binds again.
            connection.close().catch(() => undefined);
            return;
          }
          this.onMessage(channel, binding.queue, message).catch((error: unknown) => {
            this.logger.error({ err: error }, 'unexpected failure while handling a message');
          });
        });
      }
      this.logger.log('notification consumer is listening');
    } catch (error) {
      connection.close().catch(() => undefined);
      throw error;
    }
    await ended;
  }

  private async onMessage(channel: Channel, queue: string, message: ConsumeMessage): Promise<void> {
    const event = this.parse(message);
    if (event === undefined) {
      this.settle(() => channel.nack(message, false, false), 'reject malformed message');
      return;
    }

    try {
      await this.handle(event);
    } catch (error) {
      if (error instanceof EventInProgressError) {
        // The first copy is still writing. Re-publish this copy to the delay queue and ack the
        // original: a plain requeue would bounce straight back and spin until the first copy settles.
        this.settle(() => {
          channel.sendToQueue(retryQueueOf(queue), message.content, {
            persistent: true,
            contentType: 'application/json',
            messageId: message.properties.messageId,
            headers: message.properties.headers,
          });
          channel.ack(message);
        }, 'defer event still in progress');
        return;
      }
      this.logger.error({ err: error, type: event.type, eventId: event.eventId }, 'notification write failed; dead-lettering');
      this.settle(() => channel.nack(message, false, false), 'dead-letter failed message');
      return;
    }
    this.settle(() => channel.ack(message), 'ack');
  }

  private parse(message: ConsumeMessage): DomainEvent | undefined {
    try {
      const parsed: unknown = JSON.parse(message.content.toString('utf8'));
      return isDomainEvent(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Runs an ack or nack. `ack`/`nack` throw when the channel has already closed;
   * that is logged here instead of becoming an unhandled rejection. The broker
   * redelivers any message that was not settled.
   */
  private settle(action: () => void, label: string): void {
    try {
      action();
    } catch (error) {
      this.logger.warn({ err: error, action: label }, 'could not settle message; broker will redeliver it');
    }
  }
}
