import { act, renderHook } from '@testing-library/react';
import { useMediaQuery } from './use-media-query';

type Listener = () => void;

function mockMatchMedia(initial: boolean): { readonly set: (matches: boolean) => void } {
  let matches: boolean = initial;
  const listeners = new Set<Listener>();
  window.matchMedia = jest.fn().mockImplementation(() => ({
    get matches() {
      return matches;
    },
    addEventListener: (_: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
  }));
  return {
    set: (next) => {
      matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}

describe('useMediaQuery', () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
  });

  it('should answer the fallback when the environment has no matchMedia', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;

    expect(renderHook(() => useMediaQuery('(min-width: 1024px)')).result.current).toBe(true);
    expect(renderHook(() => useMediaQuery('(min-width: 1024px)', false)).result.current).toBe(false);
  });

  it('should follow the query when the viewport crosses it', () => {
    const media = mockMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'));
    expect(result.current).toBe(false);

    act(() => media.set(true));

    expect(result.current).toBe(true);
  });
});
