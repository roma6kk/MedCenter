import { EventEmitter } from 'node:events';
import { connect, type ChannelModel } from 'amqplib';

import type { WorkerConfig } from '../../config/analytics-env';
import { AnalyticsWorker, RECONNECT_DELAY_MS } from './analytics.worker';
import { ATTEMPT_HEADER, type DeliveryProcessor, type Disposition } from './delivery.processor';

jest.mock('amqplib', () => ({ connect: jest.fn() }));
const connectMock = connect as jest.MockedFunction<typeof connect>;

const ENABLED: WorkerConfig = { enabled: true, rabbitmqUrl: 'amqp://rabbitmq:5672' };

type ConsumeCallback = (message: unknown) => void;

function fakeChannel() {
  return Object.assign(new EventEmitter(), {
    prefetch: jest.fn().mockResolvedValue(undefined),
    assertExchange: jest.fn().mockResolvedValue({}),
    assertQueue: jest.fn().mockResolvedValue({}),
    bindQueue: jest.fn().mockResolvedValue({}),
    consume: jest.fn().mockResolvedValue({}),
    ack: jest.fn(),
    nack: jest.fn(),
    sendToQueue: jest.fn(),
  });
}

function fakeConnection(channel = fakeChannel()) {
  return Object.assign(new EventEmitter(), {
    createChannel: jest.fn().mockResolvedValue(channel),
    close: jest.fn().mockResolvedValue(undefined),
    channel,
  });
}

const delivery = (headers: Record<string, unknown> = {}) => ({
  content: Buffer.from('{}'),
  properties: { headers, messageId: 'evt-1' },
});

/** Lets pending promise chains run (also under fake timers). */
const flush = (): Promise<void> => jest.advanceTimersByTimeAsync(0);

function consumerOf(connection: ReturnType<typeof fakeConnection>, queue: string): ConsumeCallback {
  const call = connection.channel.consume.mock.calls.find((args: ReadonlyArray<unknown>) => args[0] === queue);
  return call?.[1] as ConsumeCallback;
}

describe('AnalyticsWorker', () => {
  let processor: jest.Mocked<Pick<DeliveryProcessor, 'process'>>;

  function startWorker(config: WorkerConfig = ENABLED): AnalyticsWorker {
    const worker = new AnalyticsWorker(processor as unknown as DeliveryProcessor, config);
    worker.onModuleInit();
    return worker;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    connectMock.mockReset();
    processor = { process: jest.fn<Promise<Disposition>, [Buffer, number]>().mockResolvedValue('ack') };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should not connect to the broker when CONSUMER_ENABLED=false', () => {
    startWorker({ enabled: false, rabbitmqUrl: undefined });

    expect(connectMock).not.toHaveBeenCalled();
  });

  it('should bind its own analytics queues with dead-letter queues when it starts', async () => {
    const connection = fakeConnection();
    connectMock.mockResolvedValue(connection as unknown as ChannelModel);

    startWorker();
    await flush();

    const bound = connection.channel.bindQueue.mock.calls.map((args: ReadonlyArray<unknown>) => [args[0], args[2]]);
    expect(bound).toEqual([
      ['analytics.appointment-booked', 'appointment.booked.v1'],
      ['analytics.appointment-cancelled', 'appointment.cancelled.v1'],
      ['analytics.encounter-completed', 'encounter.completed.v1'],
    ]);
    expect(connection.channel.assertQueue).toHaveBeenCalledWith('analytics.encounter-completed.dlq', { durable: true });
  });

  it('should ack a delivery when the processor committed it', async () => {
    const connection = fakeConnection();
    connectMock.mockResolvedValue(connection as unknown as ChannelModel);
    startWorker();
    await flush();
    const message = delivery();

    consumerOf(connection, 'analytics.appointment-booked')(message);
    await flush();

    expect(processor.process).toHaveBeenCalledWith(message.content, 1);
    expect(connection.channel.ack).toHaveBeenCalledWith(message);
  });

  it('should nack without requeue when the processor dead-letters the delivery', async () => {
    processor.process.mockResolvedValue('dead-letter');
    const connection = fakeConnection();
    connectMock.mockResolvedValue(connection as unknown as ChannelModel);
    startWorker();
    await flush();
    const message = delivery();

    consumerOf(connection, 'analytics.appointment-cancelled')(message);
    await flush();

    expect(connection.channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(connection.channel.ack).not.toHaveBeenCalled();
  });

  it('should re-publish to the retry queue with the next attempt number and ack when a retry is due', async () => {
    processor.process.mockResolvedValue('retry');
    const connection = fakeConnection();
    connectMock.mockResolvedValue(connection as unknown as ChannelModel);
    startWorker();
    await flush();
    const message = delivery({ [ATTEMPT_HEADER]: 2 });

    consumerOf(connection, 'analytics.encounter-completed')(message);
    await flush();

    expect(processor.process).toHaveBeenCalledWith(message.content, 2);
    expect(connection.channel.sendToQueue).toHaveBeenCalledWith(
      'analytics.encounter-completed.retry',
      message.content,
      expect.objectContaining({ persistent: true, headers: { [ATTEMPT_HEADER]: 3 } }),
    );
    expect(connection.channel.ack).toHaveBeenCalledWith(message);
  });

  it('should survive a nack on a closed channel when the broker dropped mid-message', async () => {
    processor.process.mockResolvedValue('dead-letter');
    const connection = fakeConnection();
    connection.channel.nack.mockImplementation(() => {
      throw new Error('Channel closed');
    });
    connectMock.mockResolvedValue(connection as unknown as ChannelModel);
    startWorker();
    await flush();

    consumerOf(connection, 'analytics.appointment-booked')(delivery());

    await expect(flush()).resolves.toBeUndefined();
  });

  it('should reconnect and bind again after the reconnect delay when the connection closes', async () => {
    const first = fakeConnection();
    const second = fakeConnection();
    connectMock.mockResolvedValueOnce(first as unknown as ChannelModel).mockResolvedValueOnce(second as unknown as ChannelModel);
    startWorker();
    await flush();

    first.emit('close');
    await jest.advanceTimersByTimeAsync(RECONNECT_DELAY_MS);

    expect(connectMock).toHaveBeenCalledTimes(2);
    expect(second.channel.bindQueue).toHaveBeenCalledTimes(3);
  });

  it('should keep retrying when the broker is down at startup', async () => {
    const connection = fakeConnection();
    connectMock.mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValueOnce(connection as unknown as ChannelModel);
    startWorker();
    await flush();

    await jest.advanceTimersByTimeAsync(RECONNECT_DELAY_MS);

    expect(connection.channel.consume).toHaveBeenCalledTimes(3);
  });

  it('should close the connection and stop reconnecting when the module is destroyed', async () => {
    const connection = fakeConnection();
    connectMock.mockResolvedValue(connection as unknown as ChannelModel);
    const worker = startWorker();
    await flush();

    await worker.onModuleDestroy();
    connection.emit('close');
    await jest.advanceTimersByTimeAsync(RECONNECT_DELAY_MS * 2);

    expect(connection.close).toHaveBeenCalled();
    expect(connectMock).toHaveBeenCalledTimes(1);
  });
});
