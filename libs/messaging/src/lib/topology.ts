import { DLQ_SUFFIX, DOMAIN_EVENT_EXCHANGE } from '@medcenter/contracts';
import type { Channel } from 'amqplib';

export const RETRY_SUFFIX = '.retry';

/**
 * How long a deferred message waits in `<queue>.retry` before it is dead-lettered
 * back to `<queue>`. Long enough that a retry is not a hot loop, short enough that
 * an event held by a slow first copy is picked up soon after its lease ends.
 */
export const RETRY_DELAY_MS = 5_000;

/** Name of the delay queue for `queue` (see {@link bindQueueWithDlq}). */
export function retryQueueOf(queue: string): string {
  return `${queue}${RETRY_SUFFIX}`;
}

/**
 * Declares `queue` bound to `routingKey` on the `medical.events` exchange, with
 * a durable dead-letter queue `<queue>.dlq`. A message the consumer rejects
 * without requeue lands there instead of being redelivered forever.
 *
 * Also declares `<queue>.retry`, a delay queue with no consumer. A message
 * published there expires after {@link RETRY_DELAY_MS} and dead-letters back to
 * `<queue>`, which gives a deferred message a real delay before redelivery.
 */
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
