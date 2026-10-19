'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * A function with a fixed identity that always runs the latest `callback`. Lets a memoised child (a slot tile) receive a
 * handler that closes over fresh state without re-rendering on every parent render.
 */
export function useStableCallback<Args extends ReadonlyArray<unknown>, Result>(callback: (...args: Args) => Result): (...args: Args) => Result {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  });
  return useCallback((...args: Args): Result => latest.current(...args), []);
}
