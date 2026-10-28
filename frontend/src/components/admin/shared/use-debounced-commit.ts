'use client';

import { useEffect, useRef } from 'react';

/** How long typing must pause before a text filter is applied: a list is not refetched per letter, yet it answers before the reader looks for a button. */
export const FILTER_DEBOUNCE_MS = 300;

/**
 * Applies a draft (what the reader has typed) once it has stopped changing for `delayMs`, and only when it differs from
 * what is applied already. Every keystroke restarts the wait; leaving the screen cancels it. `commit` may change on every
 * render (it is read through a ref), so a caller need not memoise it.
 */
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
