import { ATTEMPT_HEADER, attemptOf, DeliveryProcessor, MAX_DELIVERY_ATTEMPTS } from './delivery.processor';
import type { IngestionService } from './ingestion.service';

const BOOKED = {
  v: 1,
  type: 'appointment.booked.v1',
  eventId: 'evt-1',
  occurredAt: '2026-10-08T10:00:00.000Z',
  appointmentId: 'apt-1',
  patientRef: 'Patient/pat-1',
  practitionerRoleRef: 'PractitionerRole/role-1',
  slotRef: 'Slot/slot-1',
  start: '2026-11-02T09:00:00+03:00',
  serviceId: 'svc-1',
};

const content = Buffer.from(JSON.stringify(BOOKED));

describe('DeliveryProcessor', () => {
  let ingestion: jest.Mocked<Pick<IngestionService, 'ingest'>>;
  let processor: DeliveryProcessor;

  beforeEach(() => {
    ingestion = { ingest: jest.fn().mockResolvedValue('applied') };
    processor = new DeliveryProcessor(ingestion as unknown as IngestionService);
  });

  it('should ack after the read-model transaction committed when the event is valid', async () => {
    expect(await processor.process(content, 1)).toBe('ack');
    expect(ingestion.ingest).toHaveBeenCalledWith(BOOKED, { isLastAttempt: false });
  });

  it('should ack a duplicate eventId when the ledger already has it', async () => {
    ingestion.ingest.mockResolvedValue('duplicate');

    expect(await processor.process(content, 1)).toBe('ack');
  });

  it('should dead-letter a malformed message at once when it can never be ingested', async () => {
    expect(await processor.process(Buffer.from('{"type":"appointment.booked.v1"}'), 1)).toBe('dead-letter');
    expect(ingestion.ingest).not.toHaveBeenCalled();
  });

  it('should schedule a delayed retry when ingestion fails before the attempt budget is spent', async () => {
    ingestion.ingest.mockRejectedValue(new Error('db unavailable'));

    expect(await processor.process(content, MAX_DELIVERY_ATTEMPTS - 1)).toBe('retry');
  });

  it('should tell ingestion it is the last attempt when the delivery budget is spent', async () => {
    await processor.process(content, MAX_DELIVERY_ATTEMPTS);

    expect(ingestion.ingest).toHaveBeenCalledWith(BOOKED, { isLastAttempt: true });
  });

  it('should not tell ingestion it is the last attempt when retries remain', async () => {
    await processor.process(content, MAX_DELIVERY_ATTEMPTS - 1);

    expect(ingestion.ingest).toHaveBeenCalledWith(BOOKED, { isLastAttempt: false });
  });

  it('should dead-letter the event when the last attempt fails too', async () => {
    ingestion.ingest.mockRejectedValue(new Error('db unavailable'));

    expect(await processor.process(content, MAX_DELIVERY_ATTEMPTS)).toBe('dead-letter');
  });
});

describe('attemptOf', () => {
  it('should count the first delivery as attempt 1 when no header is present', () => {
    expect(attemptOf(undefined)).toBe(1);
    expect(attemptOf({})).toBe(1);
  });

  it('should read the attempt the worker stamped when a retry comes back', () => {
    expect(attemptOf({ [ATTEMPT_HEADER]: 3 })).toBe(3);
  });

  it('should ignore a forged or broken header when it is not a positive integer', () => {
    expect(attemptOf({ [ATTEMPT_HEADER]: 'many' })).toBe(1);
    expect(attemptOf({ [ATTEMPT_HEADER]: -4 })).toBe(1);
  });
});
