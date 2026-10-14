import 'reflect-metadata';
import { createValidationPipe } from '@medcenter/common';

import { ListServicesQueryDto, MAX_PAGE, MAX_SEARCH_LENGTH } from './list-services-query.dto';

const pipe = createValidationPipe();

async function parse(query: Record<string, string>): Promise<ListServicesQueryDto> {
  return (await pipe.transform(query, { type: 'query', metatype: ListServicesQueryDto })) as ListServicesQueryDto;
}

describe('ListServicesQueryDto', () => {
  it('should convert page and pageSize to numbers when they are valid', async () => {
    // Act
    const query = await parse({ page: '2', pageSize: '50', search: 'терапевт' });

    // Assert
    expect(query).toMatchObject({ page: 2, pageSize: 50, search: 'терапевт' });
  });

  it('should accept an empty query when every parameter is optional', async () => {
    await expect(parse({})).resolves.toBeInstanceOf(ListServicesQueryDto);
  });

  it.each([
    ['page=abc', { page: 'abc' }],
    ['page=0', { page: '0' }],
    ['page above the limit', { page: String(MAX_PAGE + 1) }],
    ['page=1.5', { page: '1.5' }],
    ['pageSize=0', { pageSize: '0' }],
    ['pageSize=101', { pageSize: '101' }],
    ['pageSize=-1', { pageSize: '-1' }],
    ['search above the limit', { search: 'x'.repeat(MAX_SEARCH_LENGTH + 1) }],
  ])('should reject %s with a validation error when the query is parsed', async (_label, query) => {
    await expect(parse(query)).rejects.toMatchObject({ status: 400 });
  });
});
