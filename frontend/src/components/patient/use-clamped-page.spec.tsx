import { renderHook } from '@testing-library/react';
import type { PageMeta } from '@/lib/api/pagination';
import { useClampedPage } from './use-clamped-page';

function meta(totalPages: number): PageMeta {
  return { page: 3, pageSize: 10, totalItems: totalPages * 10, totalPages };
}

describe('useClampedPage', () => {
  it('should move to the last page when the list has fewer pages than the current one', () => {
    const setPage = jest.fn();

    renderHook(() => useClampedPage(meta(2), 3, setPage));

    expect(setPage).toHaveBeenCalledWith(2);
  });

  it('should go back to the first page when the list became empty', () => {
    const setPage = jest.fn();

    renderHook(() => useClampedPage(meta(0), 3, setPage));

    expect(setPage).toHaveBeenCalledWith(1);
  });

  it('should leave the page alone when it is still in range', () => {
    const setPage = jest.fn();

    renderHook(() => useClampedPage(meta(5), 3, setPage));

    expect(setPage).not.toHaveBeenCalled();
  });

  it('should do nothing while the list has not loaded yet', () => {
    const setPage = jest.fn();

    renderHook(() => useClampedPage(undefined, 3, setPage));

    expect(setPage).not.toHaveBeenCalled();
  });
});
