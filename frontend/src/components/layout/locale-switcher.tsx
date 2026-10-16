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
    <div className="flex gap-1" role="group" aria-label={t('language')}>
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={locale === code}
          onClick={() => setLocale(code)}
          className="min-h-[44px] min-w-[44px] rounded-[6px] border border-[var(--border)] px-2 py-1 text-xs uppercase aria-pressed:bg-[var(--secondary)] aria-pressed:font-semibold"
        >
          {code}
        </button>
      ))}
    </div>
  );
}
