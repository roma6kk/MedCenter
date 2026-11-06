'use client';

import { useEffect, useState } from 'react';

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
