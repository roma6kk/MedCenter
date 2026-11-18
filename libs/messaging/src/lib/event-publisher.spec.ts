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

type ChannelListeners = Record<string, (arg?: unknown) => void>;

function mockBroker(onPublish: (messageId: string, listeners: ChannelListeners) => Error | null = () => null): {
  publish: jest.Mock;
  connection: { close: jest.Mock };
  listeners: ChannelListeners;
} {
  const listeners: ChannelListeners = {};
  const publish = jest.fn((_exchange: string, _key: string, _body: Buffer, options: { messageId: string }, callback: (error: unknown) => void) => {
    callback(onPublish(options.messageId, listeners));
    return true;
  });
  const connection = {
    on: jest.fn(),
    createConfirmChannel: jest.fn().mockResolvedValue({
      on: jest.fn((name: string, listener: (arg?: unknown) => void) => {
        listeners[name] = listener;
      }),
      assertExchange: jest.fn().mockResolvedValue({}),
      publish,
    }),
    close: jest.fn().mockResolvedValue(undefined),
  };
  jest.doMock('amqplib', () => ({ connect: jest.fn().mockResolvedValue(connection) }));
  return { publish, connection, listeners };
}

async function newPublisher(): Promise<{ publish: (event: DomainEvent) => Promise<void> }> {
  const { AmqpEventPublisher } = await import('./event-publisher');
  return new AmqpEventPublisher('amqp://broker');
}

describe('AmqpEventPublisher', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('resolves only after the broker confirms the publish to the medical.events exchange', async () => {
    const { publish } = mockBroker();

    await (await newPublisher()).publish(event);

    expect(publish).toHaveBeenCalledWith(
      'medical.events',
      'appointment.booked.v1',
      expect.any(Buffer),
      expect.objectContaining({ persistent: true, mandatory: true, messageId: 'evt-1' }),
      expect.any(Function),
    );
  });

  it('rejects when the broker negatively acknowledges the message', async () => {
    mockBroker(() => new Error('nack'));

    await expect((await newPublisher()).publish(event)).rejects.toThrow('nack');
  });

  it('closes and drops the connection when the channel errors, so the next publish reconnects', async () => {
    const { connection, listeners } = mockBroker();

    await (await newPublisher()).publish(event);
    listeners['error']?.(new Error('channel gone'));

    expect(connection.close).toHaveBeenCalled();
  });

  describe('unroutable events', () => {
    function brokerThatReturns(returned: ReadonlySet<string>): void {
      mockBroker((messageId, listeners) => {
        if (returned.has(messageId)) {
          listeners['return']?.({ properties: { messageId } });
        }
        return null;
      });
    }

    it('rejects an event the broker returned as unroutable even though it then confirmed it', async () => {
      brokerThatReturns(new Set(['evt-1']));

      await expect((await newPublisher()).publish(event)).rejects.toThrow('event evt-1 is unroutable: no queue is bound to appointment.booked.v1');
    });

    it('resolves the next publish of the same event once a queue exists, and never mixes up events in flight', async () => {
      const returned = new Set(['evt-1']);
      brokerThatReturns(returned);

      const publisher = await newPublisher();
      await expect(publisher.publish(event)).rejects.toThrow('unroutable');
      returned.clear();

      await expect(publisher.publish(event)).resolves.toBeUndefined();
      await expect(publisher.publish({ ...event, eventId: 'evt-2' })).resolves.toBeUndefined();
    });

    it('rejects only the event that was returned when several are published', async () => {
      brokerThatReturns(new Set(['evt-2']));

      const publisher = await newPublisher();
      const outcomes = await Promise.allSettled([publisher.publish(event), publisher.publish({ ...event, eventId: 'evt-2' })]);

      expect(outcomes.map((outcome) => outcome.status)).toEqual(['fulfilled', 'rejected']);
    });
  });
});
