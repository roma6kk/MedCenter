import type { Channel } from 'amqplib';

import { bindQueueWithDlq, RETRY_DELAY_MS } from './topology';

describe('bindQueueWithDlq', () => {
  it('declares a delay queue that dead-letters back into the main queue after RETRY_DELAY_MS', async () => {
    const channel = {
      assertExchange: jest.fn().mockResolvedValue({}),
      assertQueue: jest.fn().mockResolvedValue({}),
      bindQueue: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<Channel>;

    await bindQueueWithDlq(channel, 'notification.appointment-booked', 'appointment.booked.v1');

    expect(channel.assertQueue).toHaveBeenNthCalledWith(3, 'notification.appointment-booked.retry', {
      durable: true,
      messageTtl: RETRY_DELAY_MS,
      deadLetterExchange: '',
      deadLetterRoutingKey: 'notification.appointment-booked',
    });
  });


  it('declares the exchange, the dead-letter queue, and a queue that dead-letters into it', async () => {
    const channel = {
      assertExchange: jest.fn().mockResolvedValue({}),
      assertQueue: jest.fn().mockResolvedValue({}),
      bindQueue: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<Channel>;

    await bindQueueWithDlq(channel, 'notification.appointment-booked', 'appointment.booked.v1');

    expect(channel.assertExchange).toHaveBeenCalledWith('medical.events', 'topic', { durable: true });
    expect(channel.assertQueue).toHaveBeenNthCalledWith(1, 'notification.appointment-booked.dlq', { durable: true });
    expect(channel.assertQueue).toHaveBeenNthCalledWith(2, 'notification.appointment-booked', {
      durable: true,
      deadLetterExchange: '',
      deadLetterRoutingKey: 'notification.appointment-booked.dlq',
    });
    expect(channel.bindQueue).toHaveBeenCalledWith(
      'notification.appointment-booked',
      'medical.events',
      'appointment.booked.v1',
    );
  });
});
