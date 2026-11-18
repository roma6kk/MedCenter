'use client';

import { useEffect, useRef } from 'react';

export const FILTER_DEBOUNCE_MS = 300;

export function useDebouncedCommit<TValue>(draft: TValue, applied: TValue, commit: (value: TValue) => void, isSame: (a: TValue, b: TValue) => boolean = Object.is, delayMs: number = FILTER_DEBOUNCE_MS): void {
  const latest = useRef(commit);
  useEffect(() => {
    latest.current = commit;
  });
  const same: boolean = isSame(draft, applied);
  useEffect(() => {
    if (same) return undefined;
    const timer: number = window.setTimeout(() => latest.current(draft), delayMs);
    return () => window.clearTimeout(timer);
  }, [draft, same, delayMs]);
}
