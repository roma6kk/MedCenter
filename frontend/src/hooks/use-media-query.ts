'use client';

import { useCallback, useSyncExternalStore } from 'react';

// The server snapshot and jsdom (no matchMedia) answer `fallback`, so the wide layout renders there.
export function useMediaQuery(query: string, fallback: boolean = true): boolean {
  const subscribe = useCallback(
    (notify: () => void): (() => void) => {
      if (typeof window.matchMedia !== 'function') return () => undefined;
      const list: MediaQueryList = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    [query],
  );
  const getSnapshot = (): boolean => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : fallback);
  return useSyncExternalStore(subscribe, getSnapshot, () => fallback);
}

export const DESKTOP_QUERY = '(min-width: 1024px)';
export const WIDE_QUERY = '(min-width: 768px)';
