'use client';

import { useMemo } from 'react';
import { useUiStore } from '@/store/use-ui-store';
import { createTranslate, type Translate } from './translate';

/**
 * `const t = useT('layout.patient'); t('booking')` — translations for the active locale.
 * Works without `NextIntlClientProvider`; re-renders when the locale changes.
 */
export function useT(namespace?: string): Translate {
  const locale = useUiStore((state) => state.locale);
  return useMemo(() => createTranslate(locale, namespace), [locale, namespace]);
}
