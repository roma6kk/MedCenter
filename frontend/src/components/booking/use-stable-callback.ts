'use client';

import { useCallback, useEffect, useRef } from 'react';

export function useStableCallback<Args extends ReadonlyArray<unknown>, Result>(callback: (...args: Args) => Result): (...args: Args) => Result {
  const latest = useRef(callback);
  useEffect(() => {
    latest.current = callback;
  });
  return useCallback((...args: Args): Result => latest.current(...args), []);
}
