'use client';

import type { ReactNode } from 'react';
import { useT } from '@/lib/i18n/use-t';
import { SECTION_CLASS } from './catalog-styles';
import { CLINIC_LEGAL, CLINIC_LICENSE } from './home-content';

/** Legal line of the public pages: the operator, the licence, and the note that the details are demonstration data. */
export function PublicFooter(): ReactNode {
  const t = useT('home');
  return (
    <footer className="border-t border-border bg-card">
      <div className={`${SECTION_CLASS} flex flex-col gap-1 py-8 text-sm text-muted-foreground`}>
        <p>{t('footerLegal', { name: CLINIC_LEGAL.name, unp: CLINIC_LEGAL.unp })}</p>
        <p>{t('footerLicense', { number: CLINIC_LICENSE.number, date: CLINIC_LICENSE.date })}</p>
        <p>{t('demoNote')}</p>
      </div>
    </footer>
  );
}
