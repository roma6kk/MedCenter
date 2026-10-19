'use client';

import type { ReactNode } from 'react';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { useT } from '@/lib/i18n/use-t';
import { SECONDARY_BUTTON_CLASS } from './catalog-styles';

interface CatalogUnavailableProps {
  /** Namespace with `loadError` / `loadErrorHint` (`home` or `catalog`). */
  readonly namespace: 'home' | 'catalog';
  /** Where "retry" leads: the same page, so the server renders it again. */
  readonly retryHref: string;
}

/** The catalog could not be loaded on the server: a banner with the cause and a retry link (no client JS needed). */
export function CatalogUnavailable({ namespace, retryHref }: CatalogUnavailableProps): ReactNode {
  const t = useT(namespace);
  const tCommon = useT('common');
  return (
    <div className="space-y-3" data-testid="catalog-unavailable">
      <ProblemBanner title={t('loadError')} detail={t('loadErrorHint')} />
      <a href={retryHref} className={SECONDARY_BUTTON_CLASS}>{tCommon('retry')}</a>
    </div>
  );
}
