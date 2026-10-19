import { renderHook } from '@testing-library/react';
import { useIdempotencyKey } from './use-idempotency-key';

describe('useIdempotencyKey', () => {
  it('should return the same key for the same intent when a request is retried', () => {
    const { result } = renderHook(() => useIdempotencyKey('2026-10-16|2026-10-30'));

    expect(result.current.current()).toBe(result.current.current());
  });

  it('should return a new key when the intent changes', () => {
    const { result, rerender } = renderHook(({ intent }) => useIdempotencyKey(intent), { initialProps: { intent: 'a' } });
    const first = result.current.current();

    rerender({ intent: 'b' });

    expect(result.current.current()).not.toBe(first);
  });

  it('should return a new key when the intent has been finished with rotate', () => {
    const { result } = renderHook(() => useIdempotencyKey('a'));
    const first = result.current.current();

    result.current.rotate();

    expect(result.current.current()).not.toBe(first);
  });

  it('should look like a uuid when a key is made', () => {
    const { result } = renderHook(() => useIdempotencyKey('a'));

    expect(result.current.current()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
