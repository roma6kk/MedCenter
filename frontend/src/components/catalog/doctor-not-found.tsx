'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { NotFoundState } from '@/components/feedback/states';
import { useT } from '@/lib/i18n/use-t';
import { SECONDARY_BUTTON_CLASS } from './catalog-styles';

/** The requested doctor does not exist (or the id is malformed). */
export function DoctorNotFound(): ReactNode {
  const t = useT('catalog');
  return (
    <NotFoundState
      title={t('notFoundTitle')}
      description={t('notFoundHint')}
      action={<Link href="/doctors" className={`${SECONDARY_BUTTON_CLASS} mt-4`}>{t('backToList')}</Link>}
    />
  );
}
