'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { PageMeta } from '@/lib/api/pagination';
import { pageLabel } from '@/lib/api/pagination';
import { useT } from '@/lib/i18n/use-t';
import { directoryHref, type DirectoryParams } from './doctor-directory';

const LINK_CLASS = 'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[6px] border border-[var(--border)] bg-[var(--card)] px-3 text-sm hover:bg-[var(--secondary)]';
const OFF_CLASS = 'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[6px] border border-[var(--border)] px-3 text-sm opacity-50';

/** Previous / next page of the catalog as plain links, so paging works without client JS. */
export function DoctorPager({ meta, params }: { readonly meta: PageMeta; readonly params: DirectoryParams }): ReactNode {
  const t = useT('pagination');
  const tCatalog = useT('catalog');
  const { current, total } = pageLabel(meta);
  if (total <= 1) return null;
  return (
    <nav aria-label={tCatalog('pagerLabel')} className="mt-6 flex items-center justify-center gap-3">
      {current > 1 ? (
        <Link href={directoryHref({ ...params, page: current - 1 })} rel="prev" className={LINK_CLASS}>{t('previous')}</Link>
      ) : (
        <span aria-disabled="true" className={OFF_CLASS}>{t('previous')}</span>
      )}
      <span aria-live="polite" className="text-sm">{t('status', { current, total })}</span>
      {current < total ? (
        <Link href={directoryHref({ ...params, page: current + 1 })} rel="next" className={LINK_CLASS}>{t('next')}</Link>
      ) : (
        <span aria-disabled="true" className={OFF_CLASS}>{t('next')}</span>
      )}
    </nav>
  );
}
