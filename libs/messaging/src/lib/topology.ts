import { DLQ_SUFFIX, DOMAIN_EVENT_EXCHANGE } from '@medcenter/contracts';
import type { Channel } from 'amqplib';

export const RETRY_SUFFIX = '.retry';

export const RETRY_DELAY_MS = 5_000;

export function retryQueueOf(queue: string): string {
  return `${queue}${RETRY_SUFFIX}`;
}

/** Binds `queue` with a dead-letter queue `<queue>.dlq` and a consumerless delay queue `<queue>.retry` that dead-letters back after RETRY_DELAY_MS. */
export async function bindQueueWithDlq(
  channel: Channel,
  queue: string,
  routingKey: string,
): Promise<void> {
  const deadLetterQueue = `${queue}${DLQ_SUFFIX}`;
  await channel.assertExchange(DOMAIN_EVENT_EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(deadLetterQueue, { durable: true });
  await channel.assertQueue(queue, {
    durable: true,
    deadLetterExchange: '',
    deadLetterRoutingKey: deadLetterQueue,
  });
  await channel.assertQueue(retryQueueOf(queue), {
    durable: true,
    messageTtl: RETRY_DELAY_MS,
    deadLetterExchange: '',
    deadLetterRoutingKey: queue,
  });
  await channel.bindQueue(queue, DOMAIN_EVENT_EXCHANGE, routingKey);
}
