import type { Channel, ConsumeMessage } from 'amqplib';

import { retryQueueOf } from './topology';

/**
 * Attempt number of a delivery, read from the `header` its consumer stamped when it re-published the message
 * to the delay queue (see {@link deferDelivery}). 1 for a first delivery, or when the header is absent or invalid.
 */
export function attemptOf(headers: Readonly<Record<string, unknown>> | undefined, header: string): number {
  const value = headers?.[header];
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 1;
}

/**
 * Defers a delivery: re-publishes the message to `<queue>.retry` and acks the original, so it comes back to
 * `<queue>` after {@link RETRY_DELAY_MS}. A plain requeue would bounce straight back and spin. `headers` are those
 * of the re-published copy: a consumer that counts attempts stamps the next number into them.
 */
export function deferDelivery(
  channel: Channel,
  queue: string,
  message: ConsumeMessage,
  headers: Readonly<Record<string, unknown>> | undefined,
): void {
  channel.sendToQueue(retryQueueOf(queue), message.content, {
    persistent: true,
    contentType: 'application/json',
    messageId: message.properties.messageId,
    headers,
  });
  channel.ack(message);
}
