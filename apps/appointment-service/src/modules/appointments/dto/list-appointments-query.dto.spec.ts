// `@Type()` / `@Transform()` (class-transformer) store design metadata; Nest loads this polyfill in the running app.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ListAppointmentsQueryDto } from './list-appointments-query.dto';

async function parse(query: Record<string, unknown>): Promise<{ invalid: string[]; dto: ListAppointmentsQueryDto }> {
  const dto = plainToInstance(ListAppointmentsQueryDto, query);
  const errors = await validate(dto);
  return { invalid: errors.map((error) => error.property).sort(), dto };
}

describe('ListAppointmentsQueryDto', () => {
  it('should accept the query when it carries no status filter', async () => {
    const { invalid, dto } = await parse({ upcoming: 'true', page: '1' });

    expect(invalid).toEqual([]);
    expect(dto.status).toBeUndefined();
  });

  it.each(['booked', 'cancelled', 'noshow', 'fulfilled'])('should accept the single status %s', async (status) => {
    const { invalid, dto } = await parse({ status });

    expect(invalid).toEqual([]);
    expect(dto.status).toEqual([status]);
  });

  it('should split a comma list into statuses when several are requested', async () => {
    const { invalid, dto } = await parse({ status: 'booked,noshow' });

    expect(invalid).toEqual([]);
    expect(dto.status).toEqual(['booked', 'noshow']);
  });

  it('should accept a repeated status parameter the same way as a comma list', async () => {
    const { invalid, dto } = await parse({ status: ['booked', 'fulfilled,noshow'] });

    expect(invalid).toEqual([]);
    expect(dto.status).toEqual(['booked', 'fulfilled', 'noshow']);
  });

  it('should drop duplicates and surrounding spaces when the list repeats a status', async () => {
    const { dto } = await parse({ status: 'booked, booked ,cancelled' });

    expect(dto.status).toEqual(['booked', 'cancelled']);
  });

  it('should treat an empty status as no filter', async () => {
    const { invalid, dto } = await parse({ status: '' });

    expect(invalid).toEqual([]);
    expect(dto.status).toBeUndefined();
  });

  it.each(['done', 'Booked', 'booked,', 'booked;cancelled', 'entered-in-error'])('should reject the unknown status list %s', async (status) => {
    const { invalid } = await parse({ status });

    expect(invalid).toEqual(['status']);
  });
});
