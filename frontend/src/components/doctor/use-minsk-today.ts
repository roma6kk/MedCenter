'use client';

import { useEffect, useState } from 'react';
import { clinicDateKey } from '@/lib/clinic-time';

/** How often a page left open looks at the clock; a day boundary is noticed within this time. */
export const TODAY_CHECK_MS = 60_000;

/**
 * Today's clinic day, kept current: a journal left open overnight (or a tab woken from sleep) moves on to the new day
 * instead of keeping yesterday as "today". Re-renders only when the day changes.
 */
export function useMinskToday(): string {
  const [today, setToday] = useState<string>(() => clinicDateKey());
  useEffect(() => {
    const refresh = (): void => setToday(clinicDateKey());
    const timer = window.setInterval(refresh, TODAY_CHECK_MS);
    document.addEventListener('visibilitychange', refresh);
    refresh();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return today;
}
