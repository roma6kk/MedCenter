import { act, renderHook } from '@testing-library/react';
import { STAGGER_WINDOW_MS, useStaggerOnce } from './use-stagger-once';

describe('useStaggerOnce', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('should answer the stagger class when the list shows for the first time', () => {
    const { result } = renderHook(() => useStaggerOnce());

    expect(result.current).toBe('stagger-children');
  });

  it('should stop animating after the entrance window so a page change or a refetch adds rows without motion', () => {
    const { result } = renderHook(() => useStaggerOnce());

    act(() => {
      jest.advanceTimersByTime(STAGGER_WINDOW_MS + 1);
    });

    expect(result.current).toBeUndefined();
  });

  it('should wait for the data before it opens the window when the list is not ready', () => {
    const { result, rerender } = renderHook(({ ready }) => useStaggerOnce(ready), { initialProps: { ready: false } });
    act(() => {
      jest.advanceTimersByTime(STAGGER_WINDOW_MS * 3);
    });
    expect(result.current).toBeUndefined();

    rerender({ ready: true });

    expect(result.current).toBe('stagger-children');
  });
});
