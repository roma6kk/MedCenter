import { createEventPublisherProvider, type DomainEvent } from './event-publisher';

const event: DomainEvent = {
  v: 1,
  type: 'appointment.booked.v1',
  eventId: 'evt-1',
  occurredAt: '2026-10-08T10:00:00.000Z',
};

describe('createEventPublisherProvider', () => {
  it('fails at startup when RABBITMQ_URL is missing, instead of on the first event', () => {
    const provider = createEventPublisherProvider({} as NodeJS.ProcessEnv) as { useFactory: () => unknown };

    expect(() => provider.useFactory()).toThrow('RABBITMQ_URL is not configured');
  });
});

describe('AmqpEventPublisher', () => {
  beforeEach(() => {
    // Each test re-imports the module so its `amqplib` mock takes effect.
    jest.resetModules();
  });

  it('resolves only after the broker confirms the publish to the medical.events exchange', async () => {
    const publish = jest.fn((_exchange: string, _key: string, _body: Buffer, _options: unknown, callback: (error: unknown) => void) => {
      callback(null);
      return true;
    });
    const connection = {
      on: jest.fn(),
      createConfirmChannel: jest.fn().mockResolvedValue({
        on: jest.fn(),
        assertExchange: jest.fn().mockResolvedValue({}),
        publish,
      }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    jest.doMock('amqplib', () => ({ connect: jest.fn().mockResolvedValue(connection) }));

    const { AmqpEventPublisher } = await import('./event-publisher');
    const publisher = new AmqpEventPublisher('amqp://broker');
    await publisher.publish(event);

    expect(publish).toHaveBeenCalledWith(
      'medical.events',
      'appointment.booked.v1',
      expect.any(Buffer),
      expect.objectContaining({ persistent: true, mandatory: true, messageId: 'evt-1' }),
      expect.any(Function),
    );
  });

  it('rejects when the broker negatively acknowledges the message', async () => {
    const connection = {
      on: jest.fn(),
      createConfirmChannel: jest.fn().mockResolvedValue({
        on: jest.fn(),
        assertExchange: jest.fn().mockResolvedValue({}),
        publish: (_e: string, _k: string, _b: Buffer, _o: unknown, callback: (error: unknown) => void) => {
          callback(new Error('nack'));
          return true;
        },
      }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    jest.doMock('amqplib', () => ({ connect: jest.fn().mockResolvedValue(connection) }));

    const { AmqpEventPublisher } = await import('./event-publisher');
    const publisher = new AmqpEventPublisher('amqp://broker');

    await expect(publisher.publish(event)).rejects.toThrow('nack');
  });
  it('closes and drops the connection when the channel errors, so the next publish reconnects', async () => {
    const channelListeners: Record<string, (error?: unknown) => void> = {};
    const connection = {
      on: jest.fn(),
      createConfirmChannel: jest.fn().mockResolvedValue({
        on: jest.fn((name: string, listener: (error?: unknown) => void) => {
          channelListeners[name] = listener;
        }),
        assertExchange: jest.fn().mockResolvedValue({}),
        publish: (_e: string, _k: string, _b: Buffer, _o: unknown, callback: (error: unknown) => void) => {
          callback(null);
          return true;
        },
      }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    jest.doMock('amqplib', () => ({ connect: jest.fn().mockResolvedValue(connection) }));

    const { AmqpEventPublisher } = await import('./event-publisher');
    const publisher = new AmqpEventPublisher('amqp://broker');
    await publisher.publish(event);
    channelListeners['error']?.(new Error('channel gone'));

    expect(connection.close).toHaveBeenCalled();
  });

  describe('unroutable events', () => {
    /** A broker whose `publish` is scripted: it may return the message first, then it always confirms. */
    function brokerThatReturns(returned: ReadonlySet<string>) {
      const listeners: Record<string, (message: unknown) => void> = {};
      const connection = {
        on: jest.fn(),
        createConfirmChannel: jest.fn().mockResolvedValue({
          on: jest.fn((name: string, listener: (message: unknown) => void) => {
            listeners[name] = listener;
          }),
          assertExchange: jest.fn().mockResolvedValue({}),
          publish: (_e: string, _k: string, _b: Buffer, options: { messageId: string }, callback: (error: unknown) => void) => {
            if (returned.has(options.messageId)) {
              listeners['return']?.({ properties: { messageId: options.messageId } });
            }
            callback(null);
            return true;
          },
        }),
        close: jest.fn().mockResolvedValue(undefined),
      };
      jest.doMock('amqplib', () => ({ connect: jest.fn().mockResolvedValue(connection) }));
    }

    it('rejects an event the broker returned as unroutable even though it then confirmed it', async () => {
      brokerThatReturns(new Set(['evt-1']));

      const { AmqpEventPublisher } = await import('./event-publisher');
      const publisher = new AmqpEventPublisher('amqp://broker');

      await expect(publisher.publish(event)).rejects.toThrow('event evt-1 is unroutable: no queue is bound to appointment.booked.v1');
    });

    it('resolves the next publish of the same event once a queue exists, and never mixes up events in flight', async () => {
      const returned = new Set(['evt-1']);
      brokerThatReturns(returned);

      const { AmqpEventPublisher } = await import('./event-publisher');
      const publisher = new AmqpEventPublisher('amqp://broker');
      await expect(publisher.publish(event)).rejects.toThrow('unroutable');
      returned.clear();

      await expect(publisher.publish(event)).resolves.toBeUndefined();
      await expect(publisher.publish({ ...event, eventId: 'evt-2' })).resolves.toBeUndefined();
    });

    it('rejects only the event that was returned when several are published', async () => {
      brokerThatReturns(new Set(['evt-2']));

      const { AmqpEventPublisher } = await import('./event-publisher');
      const publisher = new AmqpEventPublisher('amqp://broker');
      const outcomes = await Promise.allSettled([publisher.publish(event), publisher.publish({ ...event, eventId: 'evt-2' })]);

      expect(outcomes.map((outcome) => outcome.status)).toEqual(['fulfilled', 'rejected']);
    });
  });
});
