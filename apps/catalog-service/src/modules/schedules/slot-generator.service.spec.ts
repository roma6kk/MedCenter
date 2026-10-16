import { BadRequestException, ConflictException } from '@nestjs/common';
import type { FhirClient } from '@medcenter/fhir';

import { RedisCacheService } from '../cache/redis-cache.service';
import { SLOT_DURATION_EXT, WEEKLY_WINDOWS_EXT } from './schedule.constants';
import { batchResponseFor } from './__tests__/batch-echo';
import { SlotGeneratorService } from './slot-generator.service';

function createFhirClientMock(): jest.Mocked<FhirClient> {
  return {
    search: jest.fn(),
    read: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    batch: jest.fn(),
  } as unknown as jest.Mocked<FhirClient>;
}

describe('SlotGeneratorService', () => {
  let generator: SlotGeneratorService;
  let fhirClient: jest.Mocked<FhirClient>;
  const scheduleId = 'sched-9';

  beforeEach(() => {
    fhirClient = createFhirClientMock();
    generator = new SlotGeneratorService(fhirClient, new RedisCacheService());
    fhirClient.read.mockResolvedValue({
      resourceType: 'Schedule',
      id: scheduleId,
      extension: [
        { url: SLOT_DURATION_EXT, valueInteger: 30 },
        {
          url: WEEKLY_WINDOWS_EXT,
          valueString: JSON.stringify([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '12:00' }]),
        },
      ],
    });
    fhirClient.batch.mockImplementation(async (bundle) => batchResponseFor(bundle));
  });

  it('should not duplicate slots that already exist', async () => {
    // All six planned starts of Monday 2026-11-02 (09:00-12:00 Minsk = 06:00Z-09:00Z, 30 min) already exist.
    const existingStarts = [0, 1, 2, 3, 4, 5].map(
      (i) => new Date(Date.parse('2026-11-02T06:00:00.000Z') + i * 30 * 60_000).toISOString(),
    );
    fhirClient.search.mockResolvedValue({
      entry: existingStarts.map((start, i) => ({
        resource: { resourceType: 'Slot', id: `existing-${i}`, start },
      })),
    });

    const result = await generator.generate(scheduleId, { from: '2026-11-02', to: '2026-11-02' });

    expect(result.generated).toBe(0);
    expect(result.skipped).toBe(6);
    expect(fhirClient.batch).not.toHaveBeenCalled();
  });

  it('should refuse with CONFLICT and write nothing when the schedule was deactivated by its removal', async () => {
    fhirClient.read.mockResolvedValue({ resourceType: 'Schedule', id: scheduleId, active: false });

    const attempt = generator.generate(scheduleId, { from: '2026-11-02', to: '2026-11-02' });

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toMatchObject({ response: { errorCode: 'CONFLICT' } });
    expect(fhirClient.batch).not.toHaveBeenCalled();
  });

  it('should read the slot duration from the valueInteger extension', async () => {
    fhirClient.search.mockResolvedValue({ entry: [] });
    fhirClient.read.mockResolvedValue({
      resourceType: 'Schedule',
      id: scheduleId,
      extension: [
        { url: SLOT_DURATION_EXT, valueInteger: 20 },
        {
          url: WEEKLY_WINDOWS_EXT,
          valueString: JSON.stringify([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }]),
        },
      ],
    });

    await generator.generate(scheduleId, { from: '2026-11-02', to: '2026-11-02' });

    const bundle = fhirClient.batch.mock.calls[0][0];
    const starts = (bundle['entry'] as Array<{ resource: { start: string } }>).map(
      (entry) => entry.resource.start,
    );
    // 60-minute window / 20-minute slots = 3 slots at :00 :20 :40 (09:40 Minsk = 06:40Z).
    expect(starts).toHaveLength(3);
    expect(starts[2]).toBe('2026-11-02T06:40:00.000Z');
  });

  it('should fall back to 30-minute slots when the schedule has neither extension nor legacy field', async () => {
    fhirClient.search.mockResolvedValue({ entry: [] });
    fhirClient.read.mockResolvedValue({
      resourceType: 'Schedule',
      id: scheduleId,
      extension: [
        {
          url: WEEKLY_WINDOWS_EXT,
          valueString: JSON.stringify([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '10:00' }]),
        },
      ],
    });

    await generator.generate(scheduleId, { from: '2026-11-02', to: '2026-11-02' });

    const bundle = fhirClient.batch.mock.calls[0][0];
    expect((bundle['entry'] as unknown[]).length).toBe(2);
  });

  it('should reject a range longer than the 90-day planning horizon', async () => {
    await expect(generator.generate(scheduleId, { from: '2026-01-01', to: '2026-12-31' })).rejects.toThrow(
      'planningHorizon',
    );
    await expect(
      generator.generate(scheduleId, { from: '2026-01-01', to: '2026-12-31' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should generate free slots for an in-range weekly window', async () => {
    fhirClient.search.mockResolvedValue({ entry: [] });

    // 2026-11-02 is a Monday.
    const result = await generator.generate(scheduleId, { from: '2026-11-02', to: '2026-11-02' });

    expect(result.generated).toBe(6);
    expect(result.skipped).toBe(0);
    expect(fhirClient.batch).toHaveBeenCalledTimes(1);
    const bundle = fhirClient.batch.mock.calls[0][0];
    expect(bundle['type']).toBe('batch');
    const entries = bundle['entry'] as Array<{ request: { method: string; url: string } }>;
    expect(entries).toHaveLength(6);
    expect(entries[0]?.request.method).toBe('PUT');
    expect(entries[0]?.request.url).toMatch(/^Slot\//);
  });

  it('should produce FHIR-valid slot ids (no colon, 64 chars max)', async () => {
    fhirClient.search.mockResolvedValue({ entry: [] });

    await generator.generate(scheduleId, { from: '2026-11-02', to: '2026-11-02' });

    const bundle = fhirClient.batch.mock.calls[0][0];
    const ids = (bundle['entry'] as Array<{ resource: { id: string } }>).map(
      (entry) => entry.resource.id,
    );
    expect(ids.length).toBeGreaterThan(0);
    const fhirIdPattern = /^[A-Za-z0-9\-.]{1,64}$/;
    for (const id of ids) {
      expect(id).toMatch(fhirIdPattern);
    }
  });

  it('should derive the same id for the same schedule+start (idempotency key)', async () => {
    fhirClient.search.mockResolvedValue({ entry: [] });

    await generator.generate(scheduleId, { from: '2026-11-02', to: '2026-11-02' });
    const first = (fhirClient.batch.mock.calls[0][0]['entry'] as Array<{ resource: { id: string } }>).map(
      (e) => e.resource.id,
    );

    fhirClient.batch.mockClear();
    await generator.generate(scheduleId, { from: '2026-11-02', to: '2026-11-02' });
    const second = (fhirClient.batch.mock.calls[0][0]['entry'] as Array<{ resource: { id: string } }>).map(
      (e) => e.resource.id,
    );

    expect(second).toEqual(first);
  });

  it('should partially regenerate: skip existing slots, batch only new days', async () => {
    // Monday 2026-11-02 fully generated (06:00Z..08:30Z); the range now reaches Monday 2026-11-09.
    const existingStarts = [0, 1, 2, 3, 4, 5].map(
      (i) => new Date(Date.parse('2026-11-02T06:00:00.000Z') + i * 30 * 60_000).toISOString(),
    );
    fhirClient.search.mockResolvedValue({
      entry: existingStarts.map((start, i) => ({ resource: { resourceType: 'Slot', id: `existing-${i}`, start } })),
    });

    const result = await generator.generate(scheduleId, { from: '2026-11-02', to: '2026-11-09' });

    expect(result.generated).toBe(6);
    expect(result.skipped).toBe(6);
    expect(fhirClient.batch).toHaveBeenCalledTimes(1);
  });
});
