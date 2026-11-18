import { Logger, type OnModuleDestroy, type Provider } from '@nestjs/common';
import { connect, type ChannelModel, type ConfirmChannel, type Message } from 'amqplib';
import { DOMAIN_EVENT_EXCHANGE, type DomainEventBase } from '@medcenter/contracts';

export type DomainEvent = DomainEventBase & { readonly type: string };

export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

/** Lazily-opened confirm channel, so a service boots while the broker is down. Every connection has `error`/`close` listeners: an unlistened `error` kills the process. */
export class AmqpEventPublisher implements EventPublisher, OnModuleDestroy {
  private readonly logger = new Logger(AmqpEventPublisher.name);
  private channel?: Promise<ConfirmChannel>;
  private connection?: ChannelModel;
  private readonly unroutable = new Set<string>();

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
          // Without it a message that finds no queue (a fresh broker, a consumer that has not declared its queue yet)
          mandatory: true,
          contentType: 'application/json',
          messageId: event.eventId,
        },
        (error) => {
          if (error !== null) {
            reject(error);
          } else if (this.unroutable.delete(event.eventId)) {
            reject(new Error(`event ${event.eventId} is unroutable: no queue is bound to ${event.type}`));
          } else {
            resolve();
          }
        },
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
      channel.on('return', (message: Message) => {
        const messageId: unknown = message.properties.messageId;
        if (typeof messageId === 'string') {
          this.unroutable.add(messageId);
        }
      });
      await channel.assertExchange(DOMAIN_EVENT_EXCHANGE, 'topic', { durable: true });
      this.connection = connection;
      return channel;
    } catch (error) {
      await connection.close().catch(() => undefined);
      throw error;
    }
  }

  private discard(connection: ChannelModel): void {
    if (this.connection === connection) {
      this.connection = undefined;
      this.channel = undefined;
      this.unroutable.clear();
    }
    connection.close().catch(() => undefined);
  }
}

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
