'use client';

import { useCallback } from 'react';
import { createTranslate, hasMessage } from '@/lib/i18n/translate';
import { useUiStore } from '@/store/use-ui-store';

export function useFormMessage(): (message: string | undefined) => string | undefined {
  const locale = useUiStore((state) => state.locale);
  return useCallback(
    (message) => {
      if (message === undefined) return undefined;
      return hasMessage(locale, message) ? createTranslate(locale)(message) : message;
    },
    [locale],
  );
}
