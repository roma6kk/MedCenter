import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { connect, type Channel, type ChannelModel, type ConsumeMessage } from 'amqplib';
import { FHIR_CLIENT, FhirClientError, type FhirClient, type FhirResource } from '@medcenter/fhir';
import { attemptOf, bindQueueWithDlq, deferDelivery, type DomainEvent } from '@medcenter/messaging';

import { communicationFromEvent } from './communication.mapper';
import { DeduplicationService, EventInProgressError } from './deduplication.service';
import { NOTIFICATION_BINDINGS } from './notification.bindings';
import { InvalidEventError, parseNotificationEvent } from './notification-event';

const RECONNECT_DELAY_MS = 5_000;
const PREFETCH = 10;

export const ATTEMPT_HEADER = 'x-notification-attempt';

// ~55 s of delayed retries: long enough for HAPI or Redis to restart, then the DLQ.
export const MAX_NOTIFICATION_ATTEMPTS = 12;

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

@Injectable()
export class ConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConsumerService.name);
  private connection?: ChannelModel;
  private stopped = false;
  private listening = false;

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

  isListening(): boolean {
    return this.listening;
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    await this.connection?.close().catch((error: unknown) => {
      this.logger.warn({ err: error }, 'RabbitMQ connection did not close cleanly');
    });
  }

  /** A duplicate while the first copy is still writing is deferred, not acked: acking would lose the event if that write fails. */
  async handle(event: DomainEvent): Promise<void> {
    const known = parseNotificationEvent(event);
    if (known === undefined) {
      this.logger.warn({ type: event.type, eventId: event.eventId }, 'unknown event type; acknowledged without a notification');
      return;
    }
    const communication = communicationFromEvent(known);
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

  /** Deterministic id from the eventId; an existing resource (maybe already read by the patient) is never overwritten. */
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
            connection.close().catch(() => undefined);
            return;
          }
          this.onMessage(channel, binding.queue, message).catch((error: unknown) => {
            this.logger.error({ err: error }, 'unexpected failure while handling a message');
          });
        });
      }
      this.listening = true;
      this.logger.log('notification consumer is listening');
    } catch (error) {
      connection.close().catch(() => undefined);
      throw error;
    }
    try {
      await ended;
    } finally {
      this.listening = false;
    }
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
      if (error instanceof InvalidEventError) {
        // A retry cannot repair the payload: straight to the DLQ, which keeps the copy for inspection.
        this.logger.error({ type: event.type, eventId: event.eventId, field: error.field }, 'event payload is invalid; dead-lettering');
        this.settle(() => channel.nack(message, false, false), 'dead-letter invalid event');
        return;
      }
      if (error instanceof EventInProgressError) {
        // The first copy is still writing: defer this copy and ack the original (a plain requeue would spin).
        this.settle(() => deferDelivery(channel, queue, message, message.properties.headers), 'defer event still in progress');
        return;
      }
      const attempt = attemptOf(message.properties.headers, ATTEMPT_HEADER);
      const context = { err: error, type: event.type, eventId: event.eventId, attempt };
      if (attempt < MAX_NOTIFICATION_ATTEMPTS) {
        this.logger.warn(context, 'notification write failed; retrying after a delay');
        this.settle(
          () => deferDelivery(channel, queue, message, { ...message.properties.headers, [ATTEMPT_HEADER]: attempt + 1 }),
          'retry failed message',
        );
        return;
      }
      this.logger.error(context, 'notification write failed on the last attempt; dead-lettering');
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

  /** ack/nack throw on a closed channel; log it instead of an unhandled rejection (the broker redelivers). */
  private settle(action: () => void, label: string): void {
    try {
      action();
    } catch (error) {
      this.logger.warn({ err: error, action: label }, 'could not settle message; broker will redeliver it');
    }
  }
}
