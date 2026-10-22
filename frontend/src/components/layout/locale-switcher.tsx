'use client';

import type { ReactNode } from 'react';
import { LOCALES } from '@/lib/i18n/locale';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';

export function LocaleSwitcher(): ReactNode {
  const t = useT('layout');
  const locale = useUiStore((state) => state.locale);
  const setLocale = useUiStore((state) => state.setLocale);
  return (
    <div className="flex gap-0.5" role="group" aria-label={t('language')}>
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={locale === code}
          onClick={() => setLocale(code)}
          className="min-h-[44px] min-w-[44px] rounded-control px-2 text-xs font-medium uppercase text-muted-foreground hover:bg-secondary aria-pressed:bg-primary-soft aria-pressed:font-semibold aria-pressed:text-primary-soft-foreground"
        >
          {code}
        </button>
      ))}
    </div>
  );
}
