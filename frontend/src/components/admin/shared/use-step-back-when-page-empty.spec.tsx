import { renderHook } from '@testing-library/react';
import type { PaginatedResponse } from '@/lib/api/pagination';
import { useStepBackWhenPageEmpty } from './use-step-back-when-page-empty';

function page(items: ReadonlyArray<string>, current: number, totalPages: number): PaginatedResponse<string> {
  return { items, meta: { page: current, pageSize: 10, totalItems: items.length, totalPages } };
}

describe('useStepBackWhenPageEmpty', () => {
  it('should go to the last page that has rows when the asked page came back empty', () => {
    const goToPage = jest.fn();

    renderHook(() => useStepBackWhenPageEmpty(page([], 3, 2), 3, goToPage));

    expect(goToPage).toHaveBeenCalledWith(2);
  });

  it('should stay when the page has rows', () => {
    const goToPage = jest.fn();

    renderHook(() => useStepBackWhenPageEmpty(page(['a'], 3, 3), 3, goToPage));

    expect(goToPage).not.toHaveBeenCalled();
  });

  it('should stay on the first page when the whole list is empty', () => {
    const goToPage = jest.fn();

    renderHook(() => useStepBackWhenPageEmpty(page([], 1, 0), 1, goToPage));

    expect(goToPage).not.toHaveBeenCalled();
  });

  it('should ignore the previous page when it is kept while the asked page is loading', () => {
    const goToPage = jest.fn();

    renderHook(() => useStepBackWhenPageEmpty(page([], 3, 2), 2, goToPage));

    expect(goToPage).not.toHaveBeenCalled();
  });

  it('should step back to the first page when no page is left but the asked one was not the first', () => {
    const goToPage = jest.fn();

    renderHook(() => useStepBackWhenPageEmpty(page([], 2, 0), 2, goToPage));

    expect(goToPage).toHaveBeenCalledWith(1);
  });

  it('should do nothing when there is no answer yet', () => {
    const goToPage = jest.fn();

    renderHook(() => useStepBackWhenPageEmpty(undefined, 2, goToPage));

    expect(goToPage).not.toHaveBeenCalled();
  });
});
