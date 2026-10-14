import 'reflect-metadata';
import { createValidationPipe } from '@medcenter/common';

import { MAX_PAGE, PageQueryDto } from './page-query.dto';

const pipe = createValidationPipe();

async function parse(query: Record<string, string>): Promise<PageQueryDto> {
  return (await pipe.transform(query, { type: 'query', metatype: PageQueryDto })) as PageQueryDto;
}

describe('PageQueryDto', () => {
  it('should convert page and pageSize to numbers when they are valid', async () => {
    await expect(parse({ page: '2', pageSize: '50' })).resolves.toMatchObject({ page: 2, pageSize: 50 });
  });

  it('should accept an empty query when both parameters are optional', async () => {
    await expect(parse({})).resolves.toBeInstanceOf(PageQueryDto);
  });

  it.each([
    ['page=abc', { page: 'abc' }],
    ['page=0', { page: '0' }],
    ['page above the limit', { page: String(MAX_PAGE + 1) }],
    ['page=1.5', { page: '1.5' }],
    ['pageSize=0', { pageSize: '0' }],
    ['pageSize=101', { pageSize: '101' }],
    ['pageSize=-1', { pageSize: '-1' }],
  ])('should reject %s with a validation error when the query is parsed', async (_label, query) => {
    await expect(parse(query)).rejects.toMatchObject({ status: 400 });
  });
});
