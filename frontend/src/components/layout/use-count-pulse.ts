'use client';

import { useEffect, useRef, useState } from 'react';

export const PULSE_MS = 2400;

export function useCountPulse(count: number | undefined): boolean {
  const previous = useRef<number | undefined>(undefined);
  const [isPulsing, setIsPulsing] = useState(false);
  useEffect(() => {
    if (count === undefined) return undefined;
    const before: number | undefined = previous.current;
    previous.current = count;
    if (before === undefined || count <= before) {
      setIsPulsing(false);
      return undefined;
    }
    setIsPulsing(true);
    const timer = setTimeout(() => setIsPulsing(false), PULSE_MS);
    return () => clearTimeout(timer);
  }, [count]);
  return isPulsing;
}
