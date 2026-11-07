import { EventEmitter } from 'node:events';
import { connect, type ChannelModel } from 'amqplib';
import { FhirClientError, type FhirClient } from '@medcenter/fhir';
import type { AppointmentBookedEvent, PatientRegisteredEvent } from '@medcenter/contracts';

import { communicationIdFor } from './communication.mapper';
import { ATTEMPT_HEADER, ConsumerService, MAX_NOTIFICATION_ATTEMPTS } from './consumer.service';
import { DeduplicationService, type ClaimState, type DedupStore } from './deduplication.service';
import { InvalidEventError } from './notification-event';

jest.mock('amqplib', () => ({ connect: jest.fn() }));
const connectMock = connect as jest.MockedFunction<typeof connect>;

const bookedEvent: AppointmentBookedEvent = {
  v: 1,
  type: 'appointment.booked.v1',
  eventId: 'evt-1',
  occurredAt: '2026-10-08T10:00:00.000Z',
  appointmentId: 'apt-1',
  patientRef: 'Patient/9f2c',
  practitionerRoleRef: 'PractitionerRole/role-1',
  slotRef: 'Slot/slot-1',
  start: '2026-11-02T09:00:00+03:00',
  serviceId: 'svc-1',
};

const notFound = (): FhirClientError => new FhirClientError('GET', 'http://hapi/Communication/x', 404);

const flushFakeTimers = (): Promise<void> => jest.advanceTimersByTimeAsync(0);

const drain = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const delivery = (body: unknown): { content: Buffer; properties: Record<string, unknown> } => ({
  content: Buffer.from(JSON.stringify(body)),
  properties: {},
});

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

describe('ConsumerService', () => {
  let consumer: ConsumerService;
  let fhir: jest.Mocked<FhirClient>;
  let states: Map<string, ClaimState>;

  beforeEach(() => {
    fhir = {
      search: jest.fn(),
      read: jest.fn().mockRejectedValue(notFound()),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({ resourceType: 'Communication' }),
      delete: jest.fn(),
      operation: jest.fn(),
      batch: jest.fn(),
    } as unknown as jest.Mocked<FhirClient>;

    states = new Map();
    const store: DedupStore = {
      claim: async (key) => {
        const state = states.get(key);
        if (state === undefined) {
          states.set(key, 'in-progress');
          return 'claimed';
        }
        return state;
      },
      complete: async (key) => {
        states.set(key, 'done');
      },
      delete: async (key) => {
        states.delete(key);
      },
    };
    consumer = new ConsumerService(fhir, new DeduplicationService(store));
    process.env['RABBITMQ_URL'] = 'amqp://broker';
    delete process.env['CONSUMER_ENABLED'];
    connectMock.mockReset();
  });

  describe('handle', () => {
    it('writes an in-progress Communication under the deterministic id for the event', async () => {
      await consumer.handle(bookedEvent);

      expect(fhir.update).toHaveBeenCalledWith(
        'Communication',
        communicationIdFor('evt-1'),
        expect.objectContaining({ status: 'in-progress', recipient: [{ reference: 'Patient/9f2c' }] }),
      );
      expect(fhir.create).not.toHaveBeenCalled();
    });

    it('ignores a duplicate eventId (at-least-once delivery)', async () => {
      await consumer.handle(bookedEvent);

      await expect(consumer.handle(bookedEvent)).resolves.toBeUndefined();
      expect(fhir.update).toHaveBeenCalledTimes(1);
    });

    it('never overwrites an existing Communication (a redelivery must not reset the read state)', async () => {
      fhir.read.mockResolvedValue({ resourceType: 'Communication', id: communicationIdFor('evt-1'), status: 'completed' });

      await consumer.handle(bookedEvent);

      expect(fhir.update).not.toHaveBeenCalled();
    });

    it('releases the dedup claim and rethrows when the write fails, so the redelivery is processed', async () => {
      fhir.update.mockRejectedValueOnce(new Error('HAPI down')).mockResolvedValueOnce({ resourceType: 'Communication' });

      await expect(consumer.handle(bookedEvent)).rejects.toThrow('HAPI down');
      await expect(consumer.handle(bookedEvent)).resolves.toBeUndefined();
      expect(fhir.update).toHaveBeenCalledTimes(2);
    });

    it('acknowledges an unknown event type without touching FHIR', async () => {
      const unknown = { ...bookedEvent, type: 'something.else.v1' } as unknown as AppointmentBookedEvent;

      await expect(consumer.handle(unknown)).resolves.toBeUndefined();
      expect(fhir.read).not.toHaveBeenCalled();
      expect(fhir.update).not.toHaveBeenCalled();
    });

    it.each([
      ['no patient reference', { ...bookedEvent, patientRef: undefined }, 'patientRef'],
      ['an empty patient reference', { ...bookedEvent, patientRef: '' }, 'patientRef'],
      ['a start that is no instant', { ...bookedEvent, start: 'soon' }, 'start'],
      ['a schema version other than 1', { ...bookedEvent, v: 2 }, 'v'],
    ])('rejects a booked event with %s without touching FHIR', async (_label, invalid, field) => {
      const failure = consumer.handle(invalid as unknown as AppointmentBookedEvent);

      await expect(failure).rejects.toBeInstanceOf(InvalidEventError);
      await expect(failure).rejects.toMatchObject({ field });
      expect(fhir.read).not.toHaveBeenCalled();
      expect(fhir.update).not.toHaveBeenCalled();
    });

    it('never copies the patient email from patient.registered.v1 into the Communication', async () => {
      const registered: PatientRegisteredEvent = {
        v: 1,
        type: 'patient.registered.v1',
        eventId: 'evt-2',
        occurredAt: '2026-10-08T10:00:00.000Z',
        patientId: 'p-7',
        email: 'private@example.com',
      };

      await consumer.handle(registered);

      const communication = fhir.update.mock.calls[0]?.[2] as Record<string, unknown>;
      expect(communication['recipient']).toEqual([{ reference: 'Patient/p-7' }]);
      expect(JSON.stringify(communication)).not.toContain('private@example.com');
    });
  });

  describe('broker lifecycle', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('reconnects and binds the queues again after the broker drops the connection', async () => {
      const first = fakeConnection();
      const second = fakeConnection();
      connectMock
        .mockResolvedValueOnce(first as unknown as ChannelModel)
        .mockResolvedValueOnce(second as unknown as ChannelModel);

      consumer.onModuleInit();
      await jest.advanceTimersByTimeAsync(0);
      expect(connectMock).toHaveBeenCalledTimes(1);

      first.emit('close');
      await jest.advanceTimersByTimeAsync(5_000);

      expect(connectMock).toHaveBeenCalledTimes(2);
      expect(second.createChannel).toHaveBeenCalled();
      expect(second.channel.consume).toHaveBeenCalledTimes(5);

      await consumer.onModuleDestroy();
      second.emit('close');
    });

    it('closes the connection when the channel errors, instead of crashing on an unlistened error event', async () => {
      const connection = fakeConnection();
      connectMock.mockResolvedValueOnce(connection as unknown as ChannelModel);

      consumer.onModuleInit();
      await jest.advanceTimersByTimeAsync(0);

      expect(() => connection.channel.emit('error', new Error('channel gone'))).not.toThrow();
      expect(connection.close).toHaveBeenCalled();

      await consumer.onModuleDestroy();
    });

    it('settles a message whose nack throws without an unhandled rejection', async () => {
      const connection = fakeConnection();
      connection.channel.nack.mockImplementation(() => {
        throw new Error('Channel closed');
      });
      connectMock.mockResolvedValueOnce(connection as unknown as ChannelModel);
      const unhandled = jest.fn();
      process.on('unhandledRejection', unhandled);

      try {
        consumer.onModuleInit();
        await jest.advanceTimersByTimeAsync(0);
        const deliver = connection.channel.consume.mock.calls[0]?.[1] as (message: unknown) => void;

        deliver({ content: Buffer.from('not json') });
        await jest.advanceTimersByTimeAsync(0);

        expect(connection.channel.nack).toHaveBeenCalled();
        expect(unhandled).not.toHaveBeenCalled();
      } finally {
        process.off('unhandledRejection', unhandled);
        await consumer.onModuleDestroy();
      }
    });

    it('retries when the broker is down at startup and binds once it is back', async () => {
      const connection = fakeConnection();
      connectMock
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce(connection as unknown as ChannelModel);

      consumer.onModuleInit();
      await flushFakeTimers();
      expect(connectMock).toHaveBeenCalledTimes(1);
      expect(connection.createChannel).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(5_000);

      expect(connectMock).toHaveBeenCalledTimes(2);
      expect(connection.channel.consume).toHaveBeenCalledTimes(5);
      await consumer.onModuleDestroy();
    });

    it('waits the full reconnect delay before connecting again', async () => {
      connectMock.mockRejectedValue(new Error('ECONNREFUSED'));

      consumer.onModuleInit();
      await flushFakeTimers();
      await jest.advanceTimersByTimeAsync(4_999);
      expect(connectMock).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(1);
      expect(connectMock).toHaveBeenCalledTimes(2);

      await consumer.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(5_000);
    });

    it('reconnects after the connection emits error, not only after close', async () => {
      const first = fakeConnection();
      const second = fakeConnection();
      connectMock
        .mockResolvedValueOnce(first as unknown as ChannelModel)
        .mockResolvedValueOnce(second as unknown as ChannelModel);

      consumer.onModuleInit();
      await flushFakeTimers();

      first.emit('error', new Error('socket reset'));
      await jest.advanceTimersByTimeAsync(5_000);

      expect(connectMock).toHaveBeenCalledTimes(2);
      await consumer.onModuleDestroy();
    });

    it('reconnects when the broker cancels the consumer (null delivery)', async () => {
      const first = fakeConnection();
      const second = fakeConnection();
      first.close.mockImplementation(async () => {
        first.emit('close');
      });
      connectMock
        .mockResolvedValueOnce(first as unknown as ChannelModel)
        .mockResolvedValueOnce(second as unknown as ChannelModel);

      consumer.onModuleInit();
      await flushFakeTimers();
      const onDelivery = first.channel.consume.mock.calls[0]?.[1] as (message: unknown) => void;

      onDelivery(null);
      await jest.advanceTimersByTimeAsync(5_000);

      expect(first.close).toHaveBeenCalled();
      expect(connectMock).toHaveBeenCalledTimes(2);
      await consumer.onModuleDestroy();
    });

    it('closes the connection and retries when queue setup fails part-way', async () => {
      const first = fakeConnection();
      first.channel.assertQueue.mockRejectedValueOnce(new Error('PRECONDITION_FAILED'));
      const second = fakeConnection();
      connectMock
        .mockResolvedValueOnce(first as unknown as ChannelModel)
        .mockResolvedValueOnce(second as unknown as ChannelModel);

      consumer.onModuleInit();
      await flushFakeTimers();

      expect(first.close).toHaveBeenCalled();
      expect(first.channel.consume).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(5_000);

      expect(connectMock).toHaveBeenCalledTimes(2);
      expect(second.channel.consume).toHaveBeenCalledTimes(5);
      await consumer.onModuleDestroy();
    });

    it('does not connect at all when RABBITMQ_URL is not configured', async () => {
      delete process.env['RABBITMQ_URL'];

      consumer.onModuleInit();
      await jest.advanceTimersByTimeAsync(30_000);

      expect(connectMock).not.toHaveBeenCalled();
    });

    it('stays off when CONSUMER_ENABLED=false (e2e suites)', async () => {
      process.env['CONSUMER_ENABLED'] = 'false';

      consumer.onModuleInit();
      await jest.advanceTimersByTimeAsync(30_000);

      expect(connectMock).not.toHaveBeenCalled();
    });

    it('stops reconnecting when the module is destroyed while a connection is up', async () => {
      const connection = fakeConnection();
      connection.close.mockImplementation(async () => {
        connection.emit('close');
      });
      connectMock.mockResolvedValueOnce(connection as unknown as ChannelModel);

      consumer.onModuleInit();
      await flushFakeTimers();
      await consumer.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(30_000);

      expect(connectMock).toHaveBeenCalledTimes(1);
    });

    it('does not reconnect when shutdown happens during the retry delay', async () => {
      connectMock.mockRejectedValue(new Error('ECONNREFUSED'));

      consumer.onModuleInit();
      await flushFakeTimers();
      await consumer.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(5_000);

      expect(connectMock).toHaveBeenCalledTimes(1);
    });

    it('closes a connection that completes after shutdown began, so the process can exit', async () => {
      const late = fakeConnection();
      let completeConnect!: (connection: ChannelModel) => void;
      connectMock.mockImplementationOnce(
        () => new Promise<ChannelModel>((resolve) => (completeConnect = resolve)),
      );

      consumer.onModuleInit();
      await flushFakeTimers();
      const destroyed = consumer.onModuleDestroy();
      completeConnect(late as unknown as ChannelModel);
      await destroyed;
      await flushFakeTimers();

      expect(late.close).toHaveBeenCalled();
      expect(late.channel.consume).not.toHaveBeenCalled();
    });
  });

  describe('message handling', () => {
    let connection: ReturnType<typeof fakeConnection>;

    const deliverTo = (message: unknown): void => {
      const onDelivery = connection.channel.consume.mock.calls[0]?.[1] as (message: unknown) => void;
      onDelivery(message);
    };

    beforeEach(async () => {
      connection = fakeConnection();
      connectMock.mockResolvedValueOnce(connection as unknown as ChannelModel);
      consumer.onModuleInit();
      await drain();
    });

    afterEach(async () => {
      jest.restoreAllMocks();
      await consumer.onModuleDestroy();
    });

    it('acknowledges a message only after its Communication is written', async () => {
      const message = delivery(bookedEvent);

      deliverTo(message);
      await drain();

      expect(fhir.update).toHaveBeenCalledTimes(1);
      expect(connection.channel.ack).toHaveBeenCalledWith(message);
      expect(connection.channel.nack).not.toHaveBeenCalled();
    });

    it('dead-letters a malformed message without writing or requeueing it', async () => {
      const message = { content: Buffer.from('not json') };

      deliverTo(message);
      await drain();

      expect(connection.channel.nack).toHaveBeenCalledWith(message, false, false);
      expect(connection.channel.ack).not.toHaveBeenCalled();
      expect(fhir.update).not.toHaveBeenCalled();
    });

    it.each([
      ['has no patient reference', { ...bookedEvent, patientRef: undefined }],
      ['has a start that is no instant', { ...bookedEvent, start: 'soon' }],
    ])('dead-letters a known event that %s at once, without writing, retrying or acknowledging it', async (_label, invalid) => {
      const message = delivery(invalid);

      deliverTo(message);
      await drain();

      expect(connection.channel.nack).toHaveBeenCalledWith(message, false, false);
      expect(connection.channel.sendToQueue).not.toHaveBeenCalled();
      expect(connection.channel.ack).not.toHaveBeenCalled();
      expect(fhir.read).not.toHaveBeenCalled();
      expect(fhir.update).not.toHaveBeenCalled();
    });

    it('acknowledges an event of a type it does not know without writing it', async () => {
      const message = delivery({ ...bookedEvent, type: 'something.else.v1' });

      deliverTo(message);
      await drain();

      expect(connection.channel.ack).toHaveBeenCalledWith(message);
      expect(connection.channel.nack).not.toHaveBeenCalled();
      expect(fhir.update).not.toHaveBeenCalled();
    });

    it('dead-letters JSON that is not a domain event (no eventId)', async () => {
      const message = delivery({ type: 'appointment.booked.v1' });

      deliverTo(message);
      await drain();

      expect(connection.channel.nack).toHaveBeenCalledWith(message, false, false);
      expect(fhir.update).not.toHaveBeenCalled();
    });

    it('retries a message whose write fails through the delay queue with the next attempt, and the redelivery of the same event is written', async () => {
      fhir.update.mockRejectedValueOnce(new Error('HAPI down'));
      const first = delivery(bookedEvent);

      deliverTo(first);
      await drain();

      expect(connection.channel.sendToQueue).toHaveBeenCalledWith(
        'notification.appointment-booked.retry',
        first.content,
        expect.objectContaining({ persistent: true, headers: { [ATTEMPT_HEADER]: 2 } }),
      );
      expect(connection.channel.ack).toHaveBeenCalledWith(first);
      expect(connection.channel.nack).not.toHaveBeenCalled();

      const [, content, options] = connection.channel.sendToQueue.mock.calls[0] as [string, Buffer, { headers: Record<string, unknown> }];
      const redelivery = { content, properties: { headers: options.headers } };
      deliverTo(redelivery);
      await drain();

      expect(connection.channel.ack).toHaveBeenCalledWith(redelivery);
      expect(fhir.update).toHaveBeenCalledTimes(2);
    });

    it('counts every failed delivery: the attempt before the last is retried with the last attempt number', async () => {
      fhir.update.mockRejectedValue(new Error('HAPI down'));
      const message = { content: Buffer.from(JSON.stringify(bookedEvent)), properties: { headers: { [ATTEMPT_HEADER]: MAX_NOTIFICATION_ATTEMPTS - 1, 'x-other': 'kept' } } };

      deliverTo(message);
      await drain();

      expect(connection.channel.sendToQueue).toHaveBeenCalledWith(
        'notification.appointment-booked.retry',
        message.content,
        expect.objectContaining({ headers: { [ATTEMPT_HEADER]: MAX_NOTIFICATION_ATTEMPTS, 'x-other': 'kept' } }),
      );
      expect(connection.channel.nack).not.toHaveBeenCalled();
    });

    it('dead-letters a message whose write fails on the last attempt', async () => {
      fhir.update.mockRejectedValue(new Error('HAPI down'));
      const message = { content: Buffer.from(JSON.stringify(bookedEvent)), properties: { headers: { [ATTEMPT_HEADER]: MAX_NOTIFICATION_ATTEMPTS } } };

      deliverTo(message);
      await drain();

      expect(connection.channel.nack).toHaveBeenCalledWith(message, false, false);
      expect(connection.channel.sendToQueue).not.toHaveBeenCalled();
      expect(connection.channel.ack).not.toHaveBeenCalled();
    });

    it('defers a duplicate that arrives while the first copy is still writing to the retry queue, and never acks it early', async () => {
      let finishFirstWrite!: () => void;
      fhir.update.mockImplementationOnce(
        () => new Promise((resolve) => (finishFirstWrite = () => resolve({ resourceType: 'Communication' }))),
      );
      const first = delivery(bookedEvent);
      const duplicate = delivery(bookedEvent);

      deliverTo(first);
      await drain();
      deliverTo(duplicate);
      await drain();

      expect(connection.channel.sendToQueue).toHaveBeenCalledWith(
        'notification.appointment-booked.retry',
        duplicate.content,
        expect.objectContaining({ persistent: true }),
      );
      expect(connection.channel.ack).toHaveBeenCalledWith(duplicate);
      expect(connection.channel.nack).not.toHaveBeenCalledWith(duplicate, false, true);

      finishFirstWrite();
      await drain();

      expect(connection.channel.ack).toHaveBeenCalledWith(first);
      expect(fhir.update).toHaveBeenCalledTimes(1);
    });

    it('writes an event whose first copy failed after a deferred duplicate was received (no silent loss)', async () => {
      let failFirstWrite!: (error: Error) => void;
      fhir.update.mockImplementationOnce(
        () => new Promise((_resolve, reject) => (failFirstWrite = reject)),
      );
      const first = delivery(bookedEvent);
      const duplicate = delivery(bookedEvent);

      deliverTo(first);
      await drain();
      deliverTo(duplicate);
      await drain();
      expect(connection.channel.sendToQueue).toHaveBeenCalledTimes(1);

      failFirstWrite(new Error('HAPI down'));
      await drain();
      expect(connection.channel.ack).toHaveBeenCalledWith(first);
      expect(connection.channel.nack).not.toHaveBeenCalled();
      expect(connection.channel.sendToQueue).toHaveBeenCalledTimes(2);

      const [, deferredContent] = connection.channel.sendToQueue.mock.calls[0] as [string, Buffer];
      const redelivered = { content: deferredContent, properties: {} };
      deliverTo(redelivered);
      await drain();

      expect(connection.channel.ack).toHaveBeenCalledWith(redelivered);
      expect(fhir.update).toHaveBeenCalledTimes(2);
    });

    it('retries the message without writing when the dedup store is unavailable', async () => {
      jest.spyOn(DeduplicationService.prototype, 'claim').mockRejectedValueOnce(new Error('Redis down'));
      const message = delivery(bookedEvent);

      deliverTo(message);
      await drain();

      expect(connection.channel.sendToQueue).toHaveBeenCalledWith(
        'notification.appointment-booked.retry',
        message.content,
        expect.objectContaining({ headers: { [ATTEMPT_HEADER]: 2 } }),
      );
      expect(connection.channel.ack).toHaveBeenCalledWith(message);
      expect(connection.channel.nack).not.toHaveBeenCalled();
      expect(fhir.update).not.toHaveBeenCalled();
    });

    it('keeps the attempt number of a copy deferred because the first copy is still writing', async () => {
      let finishFirstWrite!: () => void;
      fhir.update.mockImplementationOnce(
        () => new Promise((resolve) => (finishFirstWrite = () => resolve({ resourceType: 'Communication' }))),
      );
      const duplicate = { content: Buffer.from(JSON.stringify(bookedEvent)), properties: { headers: { [ATTEMPT_HEADER]: 3 } } };

      deliverTo(delivery(bookedEvent));
      await drain();
      deliverTo(duplicate);
      await drain();

      expect(connection.channel.sendToQueue).toHaveBeenCalledWith(
        'notification.appointment-booked.retry',
        duplicate.content,
        expect.objectContaining({ headers: { [ATTEMPT_HEADER]: 3 } }),
      );

      finishFirstWrite();
      await drain();
    });

    it('settles a message whose ack throws (channel closed mid-write) without an unhandled rejection', async () => {
      connection.channel.ack.mockImplementation(() => {
        throw new Error('Channel closed');
      });
      const unhandled = jest.fn();
      process.on('unhandledRejection', unhandled);

      try {
        deliverTo(delivery(bookedEvent));
        await drain();

        expect(connection.channel.ack).toHaveBeenCalled();
        expect(unhandled).not.toHaveBeenCalled();
      } finally {
        process.off('unhandledRejection', unhandled);
      }
    });
  });
});
