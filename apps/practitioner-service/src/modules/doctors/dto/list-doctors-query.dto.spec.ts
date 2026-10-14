import 'reflect-metadata';
import { createValidationPipe } from '@medcenter/common';

import { ListDoctorsQueryDto, MAX_TERM_LENGTH } from './list-doctors-query.dto';

const pipe = createValidationPipe();

async function parse(query: Record<string, string>): Promise<ListDoctorsQueryDto> {
  return (await pipe.transform(query, { type: 'query', metatype: ListDoctorsQueryDto })) as ListDoctorsQueryDto;
}

describe('ListDoctorsQueryDto', () => {
  it('should convert the paging and keep the filters when the query is valid', async () => {
    await expect(parse({ serviceId: 'svc-1', specialty: 'cardiology', search: 'Иванов', page: '3', pageSize: '10' })).resolves.toMatchObject({
      serviceId: 'svc-1',
      specialty: 'cardiology',
      search: 'Иванов',
      page: 3,
      pageSize: 10,
    });
  });

  it('should accept an empty query when every parameter is optional', async () => {
    await expect(parse({})).resolves.toBeInstanceOf(ListDoctorsQueryDto);
  });

  it.each([
    ['page=abc', { page: 'abc' }],
    ['pageSize above 100', { pageSize: '101' }],
    ['a comma-separated serviceId', { serviceId: 'a,b' }],
    ['a dots-only serviceId', { serviceId: '..' }],
    ['a search above the limit', { search: 'x'.repeat(MAX_TERM_LENGTH + 1) }],
    ['a specialty above the limit', { specialty: 'x'.repeat(MAX_TERM_LENGTH + 1) }],
  ])('should reject %s with a validation error when the query is parsed', async (_label, query) => {
    await expect(parse(query)).rejects.toMatchObject({ status: 400 });
  });
});
