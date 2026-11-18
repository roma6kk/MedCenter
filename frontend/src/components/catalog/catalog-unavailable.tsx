'use client';

import type { ReactNode } from 'react';
import { ProblemBanner } from '@/components/feedback/problem-banner';
import { useT } from '@/lib/i18n/use-t';
import { SECONDARY_BUTTON_CLASS } from './catalog-styles';

interface CatalogUnavailableProps {
  readonly namespace: 'home' | 'catalog';
  readonly retryHref: string;
}

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
