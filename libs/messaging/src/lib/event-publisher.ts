import { Logger, type OnModuleDestroy, type Provider } from '@nestjs/common';
import { connect, type ChannelModel, type ConfirmChannel } from 'amqplib';
import { DOMAIN_EVENT_EXCHANGE, type DomainEventBase } from '@medcenter/contracts';

/** Any domain event: the shared envelope plus its routing `type` (e.g. `appointment.booked.v1`). */
export type DomainEvent = DomainEventBase & { readonly type: string };

/**
 * Publishes domain events to the `medical.events` topic exchange (architect §4.4).
 * `publish` resolves only after the broker confirms the message, so callers can
 * treat a resolved promise as "the event is durable on the broker".
 */
export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

/**
 * RabbitMQ implementation over a single lazily-opened confirm channel. The
 * connection is opened on the first publish, so a service boots (and its
 * non-messaging endpoints serve traffic) even while the broker is down.
 *
 * Every connection and channel carries an `error` and `close` listener. An
 * unlistened `error` event would throw inside the broker client and take the
 * process down. When either fires, the failed connection is closed and dropped,
 * and the next publish opens a fresh one.
 */
export class AmqpEventPublisher implements EventPublisher, OnModuleDestroy {
  private readonly logger = new Logger(AmqpEventPublisher.name);
  private channel?: Promise<ConfirmChannel>;
  private connection?: ChannelModel;

  constructor(private readonly url: string) {}

  async publish(event: DomainEvent): Promise<void> {
    const channel = await this.confirmChannel();
    await new Promise<void>((resolve, reject) => {
      channel.publish(
        DOMAIN_EVENT_EXCHANGE,
        event.type,
        Buffer.from(JSON.stringify(event)),
        {
          persistent: true,
          contentType: 'application/json',
          messageId: event.eventId,
        },
        (error) => (error === null ? resolve() : reject(error)),
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    const connection = this.connection;
    this.connection = undefined;
    this.channel = undefined;
    await connection?.close().catch((error: unknown) => {
      this.logger.warn({ err: error }, 'RabbitMQ connection did not close cleanly');
    });
  }

  private confirmChannel(): Promise<ConfirmChannel> {
    this.channel ??= this.open().catch((error: unknown) => {
      this.channel = undefined;
      throw error;
    });
    return this.channel;
  }

  private async open(): Promise<ConfirmChannel> {
    const connection = await connect(this.url);
    connection.on('error', (error: unknown) => {
      this.logger.warn({ err: error }, 'RabbitMQ connection error; will reconnect on next publish');
      this.discard(connection);
    });
    connection.on('close', () => {
      this.discard(connection);
    });
    try {
      const channel = await connection.createConfirmChannel();
      channel.on('error', (error: unknown) => {
        this.logger.warn({ err: error }, 'RabbitMQ channel error; will reconnect on next publish');
        this.discard(connection);
      });
      channel.on('close', () => {
        this.discard(connection);
      });
      await channel.assertExchange(DOMAIN_EVENT_EXCHANGE, 'topic', { durable: true });
      this.connection = connection;
      return channel;
    } catch (error) {
      await connection.close().catch(() => undefined);
      throw error;
    }
  }

  /**
   * Drops `connection` and closes it. A stale connection (already replaced) is
   * only closed, so an old error event cannot discard the healthy one in use.
   */
  private discard(connection: ChannelModel): void {
    if (this.connection === connection) {
      this.connection = undefined;
      this.channel = undefined;
    }
    connection.close().catch(() => undefined);
  }
}

/** Reads `RABBITMQ_URL`; a missing URL fails the service at startup, never on the first event. */
export function createEventPublisherProvider(env: NodeJS.ProcessEnv = process.env): Provider {
  return {
    provide: EVENT_PUBLISHER,
    useFactory: (): EventPublisher => {
      const url = env['RABBITMQ_URL'];
      if (url === undefined || url === '') {
        throw new Error('RABBITMQ_URL is not configured — domain events cannot be published without it');
      }
      return new AmqpEventPublisher(url);
    },
  };
}
