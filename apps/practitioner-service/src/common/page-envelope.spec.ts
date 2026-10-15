import { toPage } from './page-envelope';

describe('toPage', () => {
  it('should use the reported total when the store gives one', () => {
    // Act
    const page = toPage(['a', 'b'], 2, 2, 5);

    // Assert
    expect(page).toEqual({ items: ['a', 'b'], meta: { page: 2, pageSize: 2, totalItems: 5, totalPages: 3 } });
  });

  it('should count up to the current page when the store gives no total', () => {
    // Act
    const page = toPage(['a'], 3, 10, undefined);

    // Assert — 2 earlier pages of 10 plus the 1 row on this page.
    expect(page.meta).toEqual({ page: 3, pageSize: 10, totalItems: 21, totalPages: 3 });
  });

  it('should report zero pages when nothing matches', () => {
    // Act
    const page = toPage([], 1, 20, 0);

    // Assert
    expect(page).toEqual({ items: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
  });
});
