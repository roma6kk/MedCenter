import { act, renderHook } from '@testing-library/react';
import type { ProblemDetails } from './problem';
import { DEFAULT_COOLDOWN_SECONDS, MAX_COOLDOWN_SECONDS, cooldownSeconds, useRetryCooldown } from './use-retry-cooldown';

function rateLimited(retryAfter?: number): ProblemDetails {
  return { title: 'Too many requests', status: 429, errorCode: 'RATE_LIMITED', ...(retryAfter === undefined ? {} : { retryAfter }) };
}

describe('cooldownSeconds', () => {
  it('should follow Retry-After when the problem is a rate limit', () => {
    expect(cooldownSeconds(rateLimited(12))).toBe(12);
  });

  it('should round a fractional Retry-After up when the problem is a rate limit', () => {
    expect(cooldownSeconds(rateLimited(1.2))).toBe(2);
  });

  it('should use a short default when a 429 names no Retry-After', () => {
    expect(cooldownSeconds(rateLimited())).toBe(DEFAULT_COOLDOWN_SECONDS);
  });

  it('should not wait when Retry-After is zero', () => {
    expect(cooldownSeconds(rateLimited(0))).toBe(0);
  });

  it('should cap the pause when Retry-After is huge', () => {
    expect(cooldownSeconds(rateLimited(3600))).toBe(MAX_COOLDOWN_SECONDS);
  });

  it('should not wait when the problem is another error or there is none', () => {
    expect(cooldownSeconds({ title: 'x', status: 500, errorCode: 'INTERNAL', retryAfter: 9 })).toBe(0);
    expect(cooldownSeconds(null)).toBe(0);
  });
});

describe('useRetryCooldown', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('should count down to zero when a rate limit is shown', () => {
    const problem: ProblemDetails = rateLimited(3);
    const { result } = renderHook(() => useRetryCooldown(problem));

    expect(result.current).toBe(3);
    act(() => jest.advanceTimersByTime(1000));
    expect(result.current).toBe(2);
    act(() => jest.advanceTimersByTime(2000));
    expect(result.current).toBe(0);
  });

  it('should be zero from the first render when there is no problem', () => {
    const { result } = renderHook(() => useRetryCooldown(null));

    expect(result.current).toBe(0);
  });

  it('should start a new countdown when another rate limit replaces the finished one', () => {
    const first: ProblemDetails = rateLimited(1);
    const second: ProblemDetails = rateLimited(4);
    const { result, rerender } = renderHook(({ problem }: { problem: ProblemDetails | null }) => useRetryCooldown(problem), { initialProps: { problem: first as ProblemDetails | null } });
    act(() => jest.advanceTimersByTime(1000));
    expect(result.current).toBe(0);

    rerender({ problem: second });

    expect(result.current).toBe(4);
  });

  it('should drop the pause at once when the problem is cleared', () => {
    const { result, rerender } = renderHook(({ problem }: { problem: ProblemDetails | null }) => useRetryCooldown(problem), { initialProps: { problem: rateLimited(30) as ProblemDetails | null } });
    expect(result.current).toBe(30);

    rerender({ problem: null });

    expect(result.current).toBe(0);
  });
});
