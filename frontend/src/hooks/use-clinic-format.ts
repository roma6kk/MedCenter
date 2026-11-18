'use client';

import { useMemo } from 'react';
import { formatClinicDate, formatClinicDateTime, formatClinicDayTime, formatClinicTime, formatDateKey, localizeInstants } from '@/lib/clinic-time';
import type { Locale } from '@/lib/i18n/locale';
import { useUiStore } from '@/store/use-ui-store';

export interface ClinicFormat {
  readonly locale: Locale;
  readonly dateTime: (iso: string) => string;
  readonly dayTime: (iso: string) => string;
  readonly time: (iso: string) => string;
  readonly date: (iso: string) => string;
  readonly dateOnly: (dateKey: string) => string;
  readonly prose: (text: string) => string;
}

export function useClinicFormat(): ClinicFormat {
  const locale = useUiStore((state) => state.locale);
  return useMemo(
    () => ({
      locale,
      dateTime: (iso: string) => formatClinicDateTime(iso, locale),
      dayTime: (iso: string) => formatClinicDayTime(iso, locale),
      time: (iso: string) => formatClinicTime(iso, locale),
      date: (iso: string) => formatClinicDate(iso, locale),
      dateOnly: (dateKey: string) => formatDateKey(dateKey, 'long', locale),
      prose: (text: string) => localizeInstants(text, locale),
    }),
    [locale],
  );
}
