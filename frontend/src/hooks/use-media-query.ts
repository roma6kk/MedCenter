'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query currently matches, following the viewport live. The server snapshot and an environment without
 * `matchMedia` (the jsdom of the unit tests) answer `fallback`, so a component that must pick one of two layouts in script
 * (a sidebar or a top bar, a week grid or a day list) renders its wide layout there.
 */
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

/** The width from which the staff shell shows its sidebar (Tailwind `lg`). */
export const DESKTOP_QUERY = '(min-width: 1024px)';
/** The width from which the doctor's schedule shows the whole week at once (Tailwind `md`). */
export const WIDE_QUERY = '(min-width: 768px)';
