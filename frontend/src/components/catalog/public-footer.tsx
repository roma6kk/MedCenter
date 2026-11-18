'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n/use-t';
import { SECTION_CLASS } from './catalog-styles';
import { CLINIC_LEGAL, CLINIC_LICENSE } from './home-content';
import { useClinic } from './use-clinic';

export function PublicFooter(): ReactNode {
  const t = useT('home');
  const clinic = useClinic();
  return (
    <footer className="border-t border-border bg-card">
      <div className={`${SECTION_CLASS} flex flex-col gap-1 py-8 text-sm text-muted-foreground`}>
        <p>{t('footerLegal', { name: clinic.name, unp: CLINIC_LEGAL.unp })}</p>
        <p>{t('footerLicense', { number: CLINIC_LICENSE.number, date: CLINIC_LICENSE.date })}</p>
        <p>{t('demoNote')}</p>
        <Link href="/privacy" className="inline-flex min-h-[44px] items-center font-medium text-primary underline">{t('footerPrivacy')}</Link>
      </div>
    </footer>
  );
}
