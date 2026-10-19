import { act, renderHook } from '@testing-library/react';
import { TODAY_CHECK_MS, useMinskToday } from './use-minsk-today';

// 2026-10-20 23:59:30 in Minsk (UTC+3) is 20:59:30 UTC.
const BEFORE_MIDNIGHT = new Date('2026-10-20T20:59:30Z');

describe('useMinskToday', () => {
  beforeEach(() => jest.useFakeTimers({ now: BEFORE_MIDNIGHT }));
  afterEach(() => jest.useRealTimers());

  it('should start with the clinic day of the moment it is rendered', () => {
    const { result } = renderHook(() => useMinskToday());

    expect(result.current).toBe('2026-10-20');
  });

  it('should move to the next clinic day when the clock passes midnight in Minsk', () => {
    const { result } = renderHook(() => useMinskToday());

    act(() => {
      jest.advanceTimersByTime(TODAY_CHECK_MS);
    });

    expect(result.current).toBe('2026-10-21');
  });

  it('should move to the new day when a tab that slept becomes visible again', () => {
    const { result } = renderHook(() => useMinskToday());
    jest.setSystemTime(new Date('2026-10-22T05:00:00Z'));

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current).toBe('2026-10-22');
  });

  it('should stop checking the clock when the component is unmounted', () => {
    const { unmount } = renderHook(() => useMinskToday());

    unmount();

    expect(jest.getTimerCount()).toBe(0);
  });
});
