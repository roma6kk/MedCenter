import type { Channel, ConsumeMessage } from 'amqplib';

import { retryQueueOf } from './topology';

export function attemptOf(headers: Readonly<Record<string, unknown>> | undefined, header: string): number {
  const value = headers?.[header];
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 1;
}

/** Re-publishes to `<queue>.retry` and acks: a plain requeue would spin. `headers` are those of the copy. */
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
