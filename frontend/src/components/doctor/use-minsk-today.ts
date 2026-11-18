'use client';

import { useEffect, useState } from 'react';
import { clinicDateKey } from '@/lib/clinic-time';

export const TODAY_CHECK_MS = 60_000;

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
