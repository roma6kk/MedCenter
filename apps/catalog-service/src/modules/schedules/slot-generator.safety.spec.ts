import { BadGatewayException, BadRequestException, Logger } from '@nestjs/common';
import type { FhirClient, FhirResource } from '@medcenter/fhir';

import { FHIR_PAGE_SIZE } from '../../common/fhir-search';
import { CACHE_KEYS, RedisCacheService } from '../cache/redis-cache.service';
import { batchResponseFor } from './__tests__/batch-echo';
import { SLOT_DURATION_EXT, WEEKLY_WINDOWS_EXT } from './schedule.constants';
import { EXISTING_SLOT_MAX_PAGES, SlotGeneratorService } from './slot-generator.service';

const SCHEDULE_ID = 'sched-9';
/** Monday 2026-11-02, 09:00-10:00 in Minsk = 06:00Z-07:00Z, two 30-minute slots. */
const WINDOWS = [{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }];
const ONE_DAY = { from: '2026-11-02', to: '2026-11-02' };

function createFhirClientMock(): jest.Mocked<FhirClient> {
  const fhirClient = {
    read: jest.fn().mockResolvedValue({
      resourceType: 'Schedule',
      id: SCHEDULE_ID,
      extension: [
        { url: SLOT_DURATION_EXT, valueInteger: 30 },
        { url: WEEKLY_WINDOWS_EXT, valueString: JSON.stringify(WINDOWS) },
      ],
    }),
    search: jest.fn().mockResolvedValue({ entry: [] }),
    batch: jest.fn().mockImplementation(async (bundle: FhirResource) => batchResponseFor(bundle)),
  } as unknown as jest.Mocked<FhirClient>;
  return fhirClient;
}

function slotAt(start: string, status = 'free'): { resource: FhirResource } {
  return { resource: { resourceType: 'Slot', id: `slot-${start}`, status, start } };
}

describe('SlotGeneratorService when HAPI cannot confirm every slot', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('should answer 502 and log the reasons when HAPI rejects some entries of the batch', async () => {
    // Arrange
    const fhirClient = createFhirClientMock();
    fhirClient.batch.mockImplementation(async (bundle) =>
      batchResponseFor(bundle, (index) => (index === 0 ? '201 Created' : '400 Bad Request')),
    );
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    // Act
    const outcome = generator.generate(SCHEDULE_ID, ONE_DAY);

    // Assert — one slot written, one not: the admin must not read that as "skipped".
    await expect(outcome).rejects.toBeInstanceOf(BadGatewayException);
    await expect(outcome).rejects.toMatchObject({
      response: { errorCode: 'INTERNAL', message: expect.stringContaining('1 slots were not written (1 were)') },
    });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ scheduleId: SCHEDULE_ID, generated: 1, failed: 1, reasons: ['400 Bad Request'] }),
      expect.any(String),
    );
  });

  it('should drop the cached slot pages before answering 502 when some slots were written', async () => {
    // Arrange
    const fhirClient = createFhirClientMock();
    fhirClient.batch.mockImplementation(async (bundle) =>
      batchResponseFor(bundle, (index) => (index === 0 ? '201 Created' : '500 Internal Server Error')),
    );
    const cache = new RedisCacheService();
    const invalidate = jest.spyOn(cache, 'invalidate').mockResolvedValue();
    const generator = new SlotGeneratorService(fhirClient, cache);

    // Act
    await generator.generate(SCHEDULE_ID, ONE_DAY).catch(() => undefined);

    // Assert — the written slot is visible at once, not after the 15 s TTL.
    expect(invalidate).toHaveBeenCalledWith([CACHE_KEYS.SCHEDULE_SLOTS(SCHEDULE_ID), CACHE_KEYS.ALL_DOCTOR_SLOTS]);
  });

  it('should count a slot as not written when the batch answer is shorter than the request', async () => {
    // Arrange
    const fhirClient = createFhirClientMock();
    fhirClient.batch.mockResolvedValue({ resourceType: 'Bundle', type: 'batch-response', entry: [] });
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    // Act / Assert
    await expect(generator.generate(SCHEDULE_ID, ONE_DAY)).rejects.toMatchObject({
      response: { message: expect.stringContaining('2 slots were not written (0 were)') },
    });
  });

  it('should report skipped existing slots and no error when every written slot is confirmed', async () => {
    // Arrange
    const fhirClient = createFhirClientMock();
    fhirClient.search.mockResolvedValue({ entry: [slotAt('2026-11-02T06:00:00.000Z')] });
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    // Act
    const result = await generator.generate(SCHEDULE_ID, ONE_DAY);

    // Assert
    expect(result).toEqual({ generated: 1, skipped: 1 });
  });
});

describe('SlotGeneratorService when the schedule already has many slots', () => {
  it('should write nothing and ask for a shorter range when the existing-slot search hits the page cap', async () => {
    // Arrange — a cut-off list could hide a booked slot, and the PUT would turn it back into `free`.
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const fhirClient = createFhirClientMock();
    fhirClient.search.mockImplementation(async (_type, params) => {
      const offset = Number((params ?? {})['_offset']);
      return {
        entry: Array.from({ length: FHIR_PAGE_SIZE }, (_, index) =>
          slotAt(new Date(Date.parse('2026-10-31T21:00:00.000Z') + (offset + index) * 1000).toISOString(), 'busy'),
        ),
      };
    });
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    // Act
    const outcome = generator.generate(SCHEDULE_ID, ONE_DAY);

    // Assert
    await expect(outcome).rejects.toBeInstanceOf(BadRequestException);
    await expect(outcome).rejects.toMatchObject({ response: { errorCode: 'VALIDATION_ERROR' } });
    expect(fhirClient.search).toHaveBeenCalledTimes(EXISTING_SLOT_MAX_PAGES);
    expect(fhirClient.batch).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('should read past the old 10 000 row limit when a long range holds many slots', async () => {
    // Arrange — 90 days of 5-minute slots is 25 920 rows (130 pages); the old cap was 50.
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const fhirClient = createFhirClientMock();
    const rows = 25_920;
    fhirClient.search.mockImplementation(async (_type, params) => {
      const offset = Number((params ?? {})['_offset']);
      const count = Math.max(0, Math.min(FHIR_PAGE_SIZE, rows - offset));
      return { entry: Array.from({ length: count }, (_, index) => slotAt(new Date(1_700_000_000_000 + (offset + index) * 300_000).toISOString())) };
    });
    const generator = new SlotGeneratorService(fhirClient, new RedisCacheService());

    // Act
    const result = await generator.generate(SCHEDULE_ID, ONE_DAY);

    // Assert
    expect(fhirClient.search).toHaveBeenCalledTimes(Math.ceil(rows / FHIR_PAGE_SIZE));
    expect(result.generated).toBe(2);
    warn.mockRestore();
  });
});
