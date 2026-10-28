'use client';

import { useEffect, useRef, useState } from 'react';

export const PULSE_MS = 2400;

/**
 * `true` for a moment after a counter goes UP (a new unread notification arrived while the page was open). The first value
 * the page reads is never a change, and a drop (something was read) ends the pulse at once. The animation itself is CSS and
 * the global `prefers-reduced-motion` rule drops it, so a reader who asked for no motion just sees the number change.
 */
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
