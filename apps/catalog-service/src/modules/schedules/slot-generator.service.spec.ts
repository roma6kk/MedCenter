import { BadRequestException, ConflictException } from '@nestjs/common';
import type { FhirClient } from '@medcenter/fhir';

import { RedisCacheService } from '../cache/redis-cache.service';
import { WEEKLY_WINDOWS_EXT } from './schedule.constants';
import { ACTOR, MONDAY_09_10, ONE_DAY, SCHEDULE_ID, generatorFhirMock, scheduleOf, searchesFor } from './__tests__/schedule-fixture';
import { SlotGeneratorService } from './slot-generator.service';

describe('SlotGeneratorService', () => {
  let generator: SlotGeneratorService;
  let fhirClient: jest.Mocked<FhirClient>;

  beforeEach(() => {
    fhirClient = generatorFhirMock();
    generator = new SlotGeneratorService(fhirClient, new RedisCacheService());
  });

  it('should not duplicate slots that already exist', async () => {
    const existingStarts = [0, 1, 2, 3, 4, 5].map(
      (i) => new Date(Date.parse('2026-11-02T06:00:00.000Z') + i * 30 * 60_000).toISOString(),
    );
    searchesFor(fhirClient, {
      entry: existingStarts.map((start, i) => ({
        resource: { resourceType: 'Slot', id: `existing-${i}`, start },
      })),
    });

    const result = await generator.generate(SCHEDULE_ID, ONE_DAY, ACTOR);

    expect(result.generated).toBe(0);
    expect(result.skipped).toBe(6);
    expect(fhirClient.batch).not.toHaveBeenCalled();
  });

  it('should refuse with CONFLICT and write nothing when the schedule was deactivated by its removal', async () => {
    fhirClient.read.mockResolvedValue({ resourceType: 'Schedule', id: SCHEDULE_ID, active: false });

    const attempt = generator.generate(SCHEDULE_ID, ONE_DAY, ACTOR);

    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toMatchObject({ response: { errorCode: 'CONFLICT' } });
    expect(fhirClient.batch).not.toHaveBeenCalled();
  });

  it('should read the slot duration from the valueInteger extension', async () => {
    fhirClient.read.mockResolvedValue(scheduleOf(MONDAY_09_10, 20));

    await generator.generate(SCHEDULE_ID, ONE_DAY, ACTOR);

    const bundle = fhirClient.batch.mock.calls[0][0];
    const starts = (bundle['entry'] as Array<{ resource: { start: string } }>).map(
      (entry) => entry.resource.start,
    );
    expect(starts).toHaveLength(3);
    expect(starts[2]).toBe('2026-11-02T06:40:00.000Z');
  });

  it('should fall back to 30-minute slots when the schedule has neither extension nor legacy field', async () => {
    fhirClient.read.mockResolvedValue({
      resourceType: 'Schedule',
      id: SCHEDULE_ID,
      extension: [{ url: WEEKLY_WINDOWS_EXT, valueString: JSON.stringify(MONDAY_09_10) }],
    });

    await generator.generate(SCHEDULE_ID, ONE_DAY, ACTOR);

    const bundle = fhirClient.batch.mock.calls[0][0];
    expect((bundle['entry'] as unknown[]).length).toBe(2);
  });

  it('should reject a range longer than the 90-day planning horizon', async () => {
    await expect(generator.generate(SCHEDULE_ID, { from: '2026-01-01', to: '2026-12-31' }, ACTOR)).rejects.toThrow(
      'planningHorizon',
    );
    await expect(
      generator.generate(SCHEDULE_ID, { from: '2026-01-01', to: '2026-12-31' }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should generate free slots for an in-range weekly window', async () => {
    const result = await generator.generate(SCHEDULE_ID, ONE_DAY, ACTOR);

    expect(result.generated).toBe(6);
    expect(result.skipped).toBe(0);
    expect(fhirClient.batch).toHaveBeenCalledTimes(2);
    const bundle = fhirClient.batch.mock.calls[0][0];
    expect(bundle['type']).toBe('batch');
    const entries = bundle['entry'] as Array<{ request: { method: string; url: string } }>;
    expect(entries).toHaveLength(6);
    expect(entries[0]?.request.method).toBe('PUT');
    expect(entries[0]?.request.url).toMatch(/^Slot\//);
  });

  it('should produce FHIR-valid slot ids (no colon, 64 chars max)', async () => {
    await generator.generate(SCHEDULE_ID, ONE_DAY, ACTOR);

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
    await generator.generate(SCHEDULE_ID, ONE_DAY, ACTOR);
    const first = (fhirClient.batch.mock.calls[0][0]['entry'] as Array<{ resource: { id: string } }>).map(
      (e) => e.resource.id,
    );

    fhirClient.batch.mockClear();
    await generator.generate(SCHEDULE_ID, ONE_DAY, ACTOR);
    const second = (fhirClient.batch.mock.calls[0][0]['entry'] as Array<{ resource: { id: string } }>).map(
      (e) => e.resource.id,
    );

    expect(second).toEqual(first);
  });

  it('should partially regenerate: skip existing slots, batch only new days', async () => {
    const existingStarts = [0, 1, 2, 3, 4, 5].map(
      (i) => new Date(Date.parse('2026-11-02T06:00:00.000Z') + i * 30 * 60_000).toISOString(),
    );
    searchesFor(fhirClient, {
      entry: existingStarts.map((start, i) => ({ resource: { resourceType: 'Slot', id: `existing-${i}`, start } })),
    });

    const result = await generator.generate(SCHEDULE_ID, { from: '2026-11-02', to: '2026-11-09' }, ACTOR);

    expect(result.generated).toBe(6);
    expect(result.skipped).toBe(6);
    expect(fhirClient.batch).toHaveBeenCalledTimes(2);
  });
});
