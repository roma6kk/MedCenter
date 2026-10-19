'use client';

import { useCallback } from 'react';
import { createTranslate, hasMessage } from '@/lib/i18n/translate';
import { useUiStore } from '@/store/use-ui-store';

/**
 * Turns a form error into display text. The zod schemas put a message KEY in `error.message` (`validation.required`),
 * while errors set from the server (`applyProblemToForm`) already carry localized text; this resolves the former and
 * leaves the latter as it is.
 */
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
