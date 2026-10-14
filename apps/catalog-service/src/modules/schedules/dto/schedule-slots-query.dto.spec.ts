import 'reflect-metadata';
import { createValidationPipe } from '@medcenter/common';

import { ScheduleSlotsQueryDto } from './schedule-slots-query.dto';

const pipe = createValidationPipe();

async function parse(query: Record<string, string>): Promise<ScheduleSlotsQueryDto> {
  return (await pipe.transform(query, { type: 'query', metatype: ScheduleSlotsQueryDto })) as ScheduleSlotsQueryDto;
}

describe('ScheduleSlotsQueryDto', () => {
  it.each([
    ['dates', { from: '2026-11-01', to: '2026-11-30' }],
    ['zoned date-times', { from: '2026-11-01T00:00:00Z', to: '2026-11-30T23:59:59+03:00' }],
    ['a single status', { from: '2026-11-01', to: '2026-11-30', status: 'free' }],
    ['several statuses', { from: '2026-11-01', to: '2026-11-30', status: 'free,busy-tentative' }],
  ])('should accept %s when the query is parsed', async (_label, query) => {
    await expect(parse(query)).resolves.toMatchObject(query);
  });

  it.each([
    ['a missing from', { to: '2026-11-30' }],
    ['a missing to', { from: '2026-11-01' }],
    ['a from that is not a date', { from: 'abc', to: '2026-11-30' }],
    ['a date-time without an offset', { from: '2026-11-01T00:00:00', to: '2026-11-30' }],
    ['a status outside the Slot value set', { from: '2026-11-01', to: '2026-11-30', status: 'open' }],
    ['a status list with an empty member', { from: '2026-11-01', to: '2026-11-30', status: 'free,' }],
    ['a status that smuggles a search parameter', { from: '2026-11-01', to: '2026-11-30', status: 'free&_count=1' }],
  ])('should reject %s with a validation error when the query is parsed', async (_label, query) => {
    await expect(parse(query)).rejects.toMatchObject({ status: 400 });
  });
});
