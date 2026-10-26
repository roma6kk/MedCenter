'use client';

import { useEffect, useState } from 'react';

/**
 * The current time, refreshed every `intervalMs`; `null` until the first client render has run, so a server-rendered page
 * never disagrees with the browser about the minute. Nothing ticks while `isActive` is false.
 */
export function useNow(intervalMs: number, isActive: boolean = true): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!isActive) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, isActive]);
  return now;
}
