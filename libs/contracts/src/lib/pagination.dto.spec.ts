import { buildPaginatedResponse } from './pagination.dto';

describe('buildPaginatedResponse', () => {
  it('should wrap items and meta into the standard envelope', () => {
    const result = buildPaginatedResponse<{ id: string }>([{ id: 'a' }], {
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    });

    expect(result).toEqual({
      items: [{ id: 'a' }],
      meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
  });
});