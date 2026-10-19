'use client';

import { useMemo } from 'react';
import type { Locale } from '@/lib/i18n/locale';
import { useUiStore } from '@/store/use-ui-store';
import { formatClinicDate, formatClinicDateTime, formatClinicTime, formatDateOnly, localizeInstants } from './clinic-date';

export interface ClinicFormat {
  readonly locale: Locale;
  readonly dateTime: (iso: string) => string;
  readonly time: (iso: string) => string;
  readonly date: (iso: string) => string;
  readonly dateOnly: (dateKey: string) => string;
  /** Server prose with its embedded UTC instants shown in clinic time. */
  readonly prose: (text: string) => string;
}

/** The clinic-zone formatters bound to the language chosen in the UI, so a component never reads the locale itself. */
export function useClinicFormat(): ClinicFormat {
  const locale = useUiStore((state) => state.locale);
  return useMemo(
    () => ({
      locale,
      dateTime: (iso: string) => formatClinicDateTime(iso, locale),
      time: (iso: string) => formatClinicTime(iso, locale),
      date: (iso: string) => formatClinicDate(iso, locale),
      dateOnly: (dateKey: string) => formatDateOnly(dateKey, locale),
      prose: (text: string) => localizeInstants(text, locale),
    }),
    [locale],
  );
}
