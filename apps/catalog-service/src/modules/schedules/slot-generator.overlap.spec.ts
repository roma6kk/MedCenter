import { BadRequestException } from '@nestjs/common';
import type { FhirClient, FhirResource } from '@medcenter/fhir';

import { committedAudit, committedWrites } from '../../common/__tests__/audited-transactions';
import { RedisCacheService } from '../cache/redis-cache.service';
import { batchResponseFor } from './__tests__/batch-echo';
import { PLANNING_HORIZON_EXT, SLOT_DURATION_EXT, WEEKLY_WINDOWS_EXT } from './schedule.constants';
import { SlotGeneratorService } from './slot-generator.service';

const ACTOR = { sub: 'admin-1', requestId: 'req-1' };
const SCHEDULE_ID = 'sched-9';
const MONDAY = { from: '2026-11-02', to: '2026-11-02' };

function schedule(durationMin: number, horizon?: { start?: string; end?: string }): FhirResource {
  return {
    resourceType: 'Schedule',
    id: SCHEDULE_ID,
    extension: [
      { url: SLOT_DURATION_EXT, valueInteger: durationMin },
      { url: WEEKLY_WINDOWS_EXT, valueString: JSON.stringify([{ dayOfWeek: 'MO', startTime: '09:00', endTime: '12:00' }]) },
      ...(horizon === undefined ? [] : [{ url: PLANNING_HORIZON_EXT, valuePeriod: horizon }]),
    ],
  };
}

function slot(start: string, minutes: number, status = 'free'): { resource: FhirResource } {
  return {
    resource: { resourceType: 'Slot', id: `s-${start}`, status, start, end: new Date(Date.parse(start) + minutes * 60_000).toISOString() },
  };
}

/** Slots of the first (slot) batch, as started instants. */
function writtenStarts(fhirClient: jest.Mocked<FhirClient>): string[] {
  const bundle = fhirClient.batch.mock.calls[0]?.[0] as unknown as { entry: Array<{ resource: { start: string } }> };
  return bundle.entry.map((entry) => entry.resource.start);
}

describe('SlotGeneratorService', () => {
  let generator: SlotGeneratorService;
  let fhirClient: jest.Mocked<FhirClient>;

  beforeEach(() => {
    fhirClient = {
      read: jest.fn().mockResolvedValue(schedule(30)),
      search: jest.fn().mockResolvedValue({ entry: [] }),
      batch: jest.fn().mockImplementation(async (bundle: FhirResource) => batchResponseFor(bundle)),
    } as unknown as jest.Mocked<FhirClient>;
    generator = new SlotGeneratorService(fhirClient, new RedisCacheService());
  });

  describe('a planned slot that overlaps a slot the schedule already has', () => {
    it('should be skipped when the duration was changed from 30 to 20 minutes, so no time is offered twice', async () => {
      // The old 30-minute grid of 09:00-12:00 Minsk (06:00Z-09:00Z).
      fhirClient.search.mockResolvedValue({
        entry: [0, 1, 2, 3, 4, 5].map((i) => slot(new Date(Date.parse('2026-11-02T06:00:00Z') + i * 30 * 60_000).toISOString(), 30)),
      });
      fhirClient.read.mockResolvedValue(schedule(20));

      const result = await generator.generate(SCHEDULE_ID, MONDAY, ACTOR);

      // 9 planned 20-minute slots; every one of them lies inside an old slot or crosses one.
      expect(result.generated).toBe(0);
      expect(result.skipped).toBe(9);
      expect(fhirClient.batch).not.toHaveBeenCalled();
    });

    it('should be skipped when the slots come from the UTC-reading generator (09:00Z instead of 06:00Z)', async () => {
      fhirClient.search.mockResolvedValue({ entry: [slot('2026-11-02T09:00:00.000Z', 30)] });

      const result = await generator.generate(SCHEDULE_ID, MONDAY, ACTOR);

      // 06:00Z..09:00Z planned; the old slot starts at 09:00Z, which touches 08:30-09:00 but does not overlap it.
      expect(result.generated).toBe(6);
    });

    it('should not be written when it crosses the end of an old slot', async () => {
      // Old slot 08:40Z-09:10Z overlaps the planned 08:30Z-09:00Z only.
      fhirClient.search.mockResolvedValue({ entry: [slot('2026-11-02T08:40:00.000Z', 30)] });

      const result = await generator.generate(SCHEDULE_ID, MONDAY, ACTOR);

      expect(result.generated).toBe(5);
      expect(result.skipped).toBe(1);
      expect(writtenStarts(fhirClient)).not.toContain('2026-11-02T08:30:00.000Z');
    });

    it('should not block a slot that only touches the old one', async () => {
      fhirClient.search.mockResolvedValue({ entry: [slot('2026-11-02T06:00:00.000Z', 30)] });

      const result = await generator.generate(SCHEDULE_ID, MONDAY, ACTOR);

      expect(result).toEqual({ generated: 5, skipped: 1 });
    });

    it('should ignore a retired slot for the overlap but still never rewrite its own id', async () => {
      fhirClient.search.mockResolvedValue({
        entry: [slot('2026-11-02T06:00:00.000Z', 30, 'entered-in-error'), slot('2026-11-02T06:40:00.000Z', 30, 'entered-in-error')],
      });

      const result = await generator.generate(SCHEDULE_ID, MONDAY, ACTOR);

      expect(result).toEqual({ generated: 5, skipped: 1 });
      expect(writtenStarts(fhirClient)).toContain('2026-11-02T06:30:00.000Z');
    });
  });

  describe('the planning horizon of the schedule', () => {
    const horizon = { start: '2026-11-10', end: '2026-11-20' };

    beforeEach(() => {
      fhirClient.read.mockResolvedValue(schedule(30, horizon));
    });

    it.each([
      ['before the first day', { from: '2026-11-02', to: '2026-11-12' }],
      ['after the last day', { from: '2026-11-16', to: '2026-11-23' }],
    ])('should refuse a range %s with 400 and write nothing', async (_label, range) => {
      const attempt = generator.generate(SCHEDULE_ID, range, ACTOR);

      await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
      await expect(attempt).rejects.toMatchObject({ response: { errorCode: 'VALIDATION_ERROR' } });
      expect(fhirClient.batch).not.toHaveBeenCalled();
    });

    it('should accept a range exactly on the bounds', async () => {
      // 2026-11-16 is the only Monday inside 2026-11-10..2026-11-20.
      const result = await generator.generate(SCHEDULE_ID, { from: '2026-11-10', to: '2026-11-20' }, ACTOR);

      expect(result.generated).toBe(6);
    });

    it('should leave a schedule without a horizon open-ended', async () => {
      fhirClient.read.mockResolvedValue(schedule(30));

      await expect(generator.generate(SCHEDULE_ID, MONDAY, ACTOR)).resolves.toMatchObject({ generated: 6 });
    });

    it('should leave a missing bound open', async () => {
      fhirClient.read.mockResolvedValue(schedule(30, { start: '2026-11-01' }));

      await expect(generator.generate(SCHEDULE_ID, MONDAY, ACTOR)).resolves.toMatchObject({ generated: 6 });
    });
  });

  describe('the journal (FR-021)', () => {
    it('should write one AuditEvent naming the schedule, the counts and the range', async () => {
      await generator.generate(SCHEDULE_ID, MONDAY, ACTOR);

      // Call 0 is the batch of slots, call 1 the audit transaction.
      expect(fhirClient.batch).toHaveBeenCalledTimes(2);
      expect(committedWrites(fhirClient, 1)).toEqual(['POST AuditEvent']);
      const audit = committedAudit(fhirClient, 1);
      expect(audit).toMatchObject({
        action: 'C',
        agent: [{ who: { identifier: { value: 'admin-1' } } }],
        outcomeDesc: 'slots generated: 6, skipped: 0, 2026-11-02..2026-11-02',
      });
      expect(audit['entity']).toEqual(expect.arrayContaining([{ what: expect.objectContaining({ type: 'Schedule', identifier: expect.objectContaining({ value: SCHEDULE_ID }) }) }]));
    });

    it('should write nothing when no slot was generated', async () => {
      fhirClient.search.mockResolvedValue({
        entry: [0, 1, 2, 3, 4, 5].map((i) => slot(new Date(Date.parse('2026-11-02T06:00:00Z') + i * 30 * 60_000).toISOString(), 30)),
      });

      await generator.generate(SCHEDULE_ID, MONDAY, ACTOR);

      expect(fhirClient.batch).not.toHaveBeenCalled();
    });
  });
});
