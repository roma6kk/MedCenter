import { act, renderHook } from '@testing-library/react';
import { PULSE_MS, useCountPulse } from './use-count-pulse';

describe('useCountPulse', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('should not pulse for the first value the page reads', () => {
    const { result, rerender } = renderHook(({ count }) => useCountPulse(count), { initialProps: { count: undefined as number | undefined } });
    expect(result.current).toBe(false);

    rerender({ count: 4 });

    expect(result.current).toBe(false);
  });

  it('should pulse when the count goes up and stop after a moment', () => {
    const { result, rerender } = renderHook(({ count }) => useCountPulse(count), { initialProps: { count: 2 as number | undefined } });

    rerender({ count: 3 });
    expect(result.current).toBe(true);

    act(() => {
      jest.advanceTimersByTime(PULSE_MS + 1);
    });
    expect(result.current).toBe(false);
  });

  it('should stop pulsing at once when the count drops', () => {
    const { result, rerender } = renderHook(({ count }) => useCountPulse(count), { initialProps: { count: 1 as number | undefined } });
    rerender({ count: 2 });
    expect(result.current).toBe(true);

    rerender({ count: 0 });

    expect(result.current).toBe(false);
  });

  it('should not pulse while the count is unknown', () => {
    const { result, rerender } = renderHook(({ count }) => useCountPulse(count), { initialProps: { count: 5 as number | undefined } });

    rerender({ count: undefined });

    expect(result.current).toBe(false);
  });
});
