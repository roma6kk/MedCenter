import 'reflect-metadata';
import { createValidationPipe } from '@medcenter/common';

import { ListSchedulesQueryDto } from './list-schedules-query.dto';

const pipe = createValidationPipe();

async function parse(query: Record<string, string>): Promise<ListSchedulesQueryDto> {
  return (await pipe.transform(query, { type: 'query', metatype: ListSchedulesQueryDto })) as ListSchedulesQueryDto;
}

describe('ListSchedulesQueryDto', () => {
  it('should accept a FHIR id and an active flag when both are valid', async () => {
    await expect(parse({ doctorId: '6ef5270b-6282-5a43-87f9-26d2d8b0c4f7', active: 'true' })).resolves.toMatchObject({
      doctorId: '6ef5270b-6282-5a43-87f9-26d2d8b0c4f7',
      active: 'true',
    });
  });

  it('should accept an empty query when every parameter is optional', async () => {
    await expect(parse({})).resolves.toBeInstanceOf(ListSchedulesQueryDto);
  });

  it.each([
    ['a comma-separated doctorId', { doctorId: 'role-1,role-2' }],
    ['a dots-only doctorId', { doctorId: '..' }],
    ['a doctorId longer than 64 characters', { doctorId: 'a'.repeat(65) }],
    ['an active flag that is not a boolean', { active: 'maybe' }],
  ])('should reject %s with a validation error when the query is parsed', async (_label, query) => {
    await expect(parse(query)).rejects.toMatchObject({ status: 400 });
  });
});
