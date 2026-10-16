import { emptyPage, isPageMeta, isPaginatedResponse, pageLabel, toPaginated } from './pagination';

const META = { page: 2, pageSize: 20, totalItems: 54, totalPages: 3 };

describe('isPaginatedResponse', () => {
  it('should accept the real {items, meta} envelope', () => {
    expect(isPaginatedResponse({ items: [{ id: 'a' }], meta: META })).toBe(true);
  });

  it.each([
    ['a bare array', [{ id: 'a' }]],
    ['no meta', { items: [] }],
    ['no items', { meta: META }],
    ['a meta without totalPages', { items: [], meta: { page: 1, pageSize: 20, totalItems: 0 } }],
    ['a negative count', { items: [], meta: { ...META, totalItems: -1 } }],
    ['null', null],
  ])('should reject %s', (_label, value) => {
    expect(isPaginatedResponse(value)).toBe(false);
  });
});

describe('isPageMeta', () => {
  it('should require four finite non-negative numbers', () => {
    expect(isPageMeta(META)).toBe(true);
    expect(isPageMeta({ ...META, page: Number.NaN })).toBe(false);
    expect(isPageMeta({ ...META, pageSize: '20' })).toBe(false);
  });
});

describe('toPaginated', () => {
  it('should wrap a bare array of a legacy list endpoint in a single page', () => {
    expect(toPaginated([{ id: 'a' }, { id: 'b' }])).toEqual({
      items: [{ id: 'a' }, { id: 'b' }],
      meta: { page: 1, pageSize: 2, totalItems: 2, totalPages: 1 },
    });
  });

  it('should report zero pages for an empty bare array', () => {
    expect(toPaginated([]).meta).toMatchObject({ totalItems: 0, totalPages: 0 });
  });

  it('should pass an envelope through unchanged', () => {
    const envelope = { items: [{ id: 'a' }], meta: META };

    expect(toPaginated(envelope)).toBe(envelope);
  });
});

describe('emptyPage', () => {
  it('should be an envelope with no items and zero pages', () => {
    expect(emptyPage()).toEqual({ items: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
  });
});

describe('pageLabel', () => {
  it('should show page 1 of 1 for an empty list', () => {
    expect(pageLabel({ page: 1, pageSize: 20, totalItems: 0, totalPages: 0 })).toEqual({ current: 1, total: 1 });
  });

  it('should clamp a page beyond the last one', () => {
    expect(pageLabel({ ...META, page: 9 })).toEqual({ current: 3, total: 3 });
  });
});
