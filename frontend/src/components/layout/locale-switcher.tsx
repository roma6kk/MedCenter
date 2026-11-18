'use client';

import type { ReactNode } from 'react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { LOCALES, type Locale } from '@/lib/i18n/locale';
import { useT } from '@/lib/i18n/use-t';
import { useUiStore } from '@/store/use-ui-store';

const OPTIONS: ReadonlyArray<{ readonly value: Locale; readonly label: string }> = LOCALES.map((code) => ({ value: code, label: code }));

export function LocaleSwitcher(): ReactNode {
  const t = useT('layout');
  const locale = useUiStore((state) => state.locale);
  const setLocale = useUiStore((state) => state.setLocale);
  // shrink-0 flex-nowrap: without it a crowded header wraps RU/EN into a column and the switch changes shape between locales.
  return <SegmentedControl kind="toggle" size="sm" label={t('language')} options={OPTIONS} value={locale} onChange={setLocale} className="shrink-0 flex-nowrap" />;
}
