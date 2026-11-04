import type { Channel, ConsumeMessage } from 'amqplib';

import { attemptOf, deferDelivery } from './retry';

const HEADER = 'x-test-attempt';

describe('attemptOf', () => {
  it('should count a delivery without headers as the first attempt', () => {
    expect(attemptOf(undefined, HEADER)).toBe(1);
    expect(attemptOf({}, HEADER)).toBe(1);
  });

  it('should read the attempt the consumer stamped under the given header', () => {
    expect(attemptOf({ [HEADER]: 3 }, HEADER)).toBe(3);
    expect(attemptOf({ 'x-other-attempt': 4 }, HEADER)).toBe(1);
  });

  it.each(['many', -4, 0, 2.5, null])('should fall back to the first attempt when the header holds %p', (value) => {
    expect(attemptOf({ [HEADER]: value }, HEADER)).toBe(1);
  });
});

describe('deferDelivery', () => {
  it('should re-publish the message to the delay queue with the given headers and ack the original', () => {
    const channel = { sendToQueue: jest.fn(), ack: jest.fn() } as unknown as jest.Mocked<Channel>;
    const message = { content: Buffer.from('{"a":1}'), properties: { messageId: 'evt-1', headers: { keep: 'me' } } } as unknown as ConsumeMessage;

    deferDelivery(channel, 'notification.appointment-booked', message, { keep: 'me', [HEADER]: 2 });

    expect(channel.sendToQueue).toHaveBeenCalledWith('notification.appointment-booked.retry', message.content, {
      persistent: true,
      contentType: 'application/json',
      messageId: 'evt-1',
      headers: { keep: 'me', [HEADER]: 2 },
    });
    expect(channel.ack).toHaveBeenCalledWith(message);
  });

  it('should ack only after the copy was handed to the broker', () => {
    const order: string[] = [];
    const channel = {
      sendToQueue: jest.fn(() => order.push('send')),
      ack: jest.fn(() => order.push('ack')),
    } as unknown as jest.Mocked<Channel>;

    deferDelivery(channel, 'q', { content: Buffer.alloc(0), properties: {} } as unknown as ConsumeMessage, undefined);

    expect(order).toEqual(['send', 'ack']);
  });
});
