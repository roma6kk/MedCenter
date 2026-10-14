import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { connect, type Channel, type ChannelModel, type ConsumeMessage } from 'amqplib';
import { bindQueueWithDlq, retryQueueOf } from '@medcenter/messaging';

import { WORKER_CONFIG, type WorkerConfig } from '../../config/analytics-env';
import { ANALYTICS_BINDINGS } from './analytics.bindings';
import { ATTEMPT_HEADER, attemptOf, DeliveryProcessor, type Disposition } from './delivery.processor';

export const RECONNECT_DELAY_MS = 5_000;
const PREFETCH = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    // Unref'd: a pending reconnect delay must not keep a stopping process alive.
    setTimeout(resolve, ms).unref();
  });
}

/**
 * RabbitMQ worker of the analytics read-model (FR-019, architect §4.4). Own
 * queues (`analytics.*`) with a DLQ each; prefetch-bounded; a message is acked
 * only after its read-model transaction committed (`DeliveryProcessor`).
 *
 * Like notification-service's consumer it runs a reconnect loop: whenever the
 * connection ends it waits {@link RECONNECT_DELAY_MS} and connects again, so a
 * broker outage never stops the HTTP endpoints. `CONSUMER_ENABLED=false`
 * switches it off (e2e suites). Every promise started here has a handler.
 */
@Injectable()
export class AnalyticsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsWorker.name);
  private connection?: ChannelModel;
  private stopped = false;

  constructor(
    private readonly processor: DeliveryProcessor,
    @Inject(WORKER_CONFIG) private readonly config: WorkerConfig,
  ) {}

  onModuleInit(): void {
    const url = this.config.rabbitmqUrl;
    if (!this.config.enabled || url === undefined) {
      this.logger.log('analytics worker is disabled (CONSUMER_ENABLED=false)');
      return;
    }
    void this.consumeForever(url).catch((error: unknown) => {
      this.logger.error({ err: error }, 'analytics worker stopped unexpectedly');
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    await this.connection?.close().catch((error: unknown) => {
      this.logger.warn({ err: error }, 'RabbitMQ connection did not close cleanly');
    });
  }

  private async consumeForever(url: string): Promise<void> {
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

  /** Resolves when the connection ends (the caller reconnects); rejects only if setup fails. */
  private async consumeUntilClosed(url: string): Promise<void> {
    const connection = await connect(url);
    if (this.stopped) {
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
      await this.bindAndConsume(connection);
    } catch (error) {
      connection.close().catch(() => undefined);
      throw error;
    }
    await ended;
  }

  private async bindAndConsume(connection: ChannelModel): Promise<void> {
    const channel = await connection.createChannel();
    channel.on('error', (error: unknown) => {
      this.logger.warn({ err: error }, 'RabbitMQ channel error; closing connection to reconnect');
      connection.close().catch(() => undefined);
    });
    await channel.prefetch(PREFETCH);
    for (const binding of ANALYTICS_BINDINGS) {
      await bindQueueWithDlq(channel, binding.queue, binding.routingKey);
      await channel.consume(binding.queue, (message) => {
        if (message === null) {
          // Broker cancelled this consumer: end the connection so the loop binds again.
          connection.close().catch(() => undefined);
          return;
        }
        this.onMessage(channel, binding.queue, message).catch((error: unknown) => {
          this.logger.error({ err: error }, 'unexpected failure while handling an analytics message');
        });
      });
    }
    this.logger.log('analytics worker is listening');
  }

  private async onMessage(channel: Channel, queue: string, message: ConsumeMessage): Promise<void> {
    const attempt = attemptOf(message.properties.headers);
    const disposition = await this.processor.process(message.content, attempt);
    this.settle(() => this.dispatch(channel, queue, message, disposition, attempt), disposition);
  }

  private dispatch(channel: Channel, queue: string, message: ConsumeMessage, disposition: Disposition, attempt: number): void {
    if (disposition === 'ack') {
      channel.ack(message);
      return;
    }
    if (disposition === 'dead-letter') {
      channel.nack(message, false, false);
      return;
    }
    // A plain requeue would bounce straight back; the retry queue delays it, then dead-letters it home.
    channel.sendToQueue(retryQueueOf(queue), message.content, {
      persistent: true,
      contentType: 'application/json',
      messageId: message.properties.messageId,
      headers: { ...message.properties.headers, [ATTEMPT_HEADER]: attempt + 1 },
    });
    channel.ack(message);
  }

  /** `ack`/`nack` throw on a closed channel; the broker then redelivers the unsettled message. */
  private settle(action: () => void, label: string): void {
    try {
      action();
    } catch (error) {
      this.logger.warn({ err: error, action: label }, 'could not settle message; broker will redeliver it');
    }
  }
}
