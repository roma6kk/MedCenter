'use client';

import { useUiStore } from '@/store/use-ui-store';

export function LocaleSwitcher(): React.JSX.Element {
  const { locale, setLocale } = useUiStore();
  return (
    <div className="flex gap-1" role="group" aria-label="Язык">
      {(['ru', 'en'] as const).map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={locale === code}
          onClick={() => setLocale(code)}
          className="min-h-[44px] min-w-[44px] rounded-[6px] border border-[var(--border)] px-2 py-1 text-xs uppercase"
        >
          {code}
        </button>
      ))}
    </div>
  );
}
