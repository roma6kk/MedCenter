'use client';

import { useMemo } from 'react';
import { useUiStore } from '@/store/use-ui-store';
import { createTranslate, type Translate } from './translate';

export function useT(namespace?: string): Translate {
  const locale = useUiStore((state) => state.locale);
  return useMemo(() => createTranslate(locale, namespace), [locale, namespace]);
}
