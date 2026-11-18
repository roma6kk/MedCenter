'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { AdminPageHeader } from '@/components/admin/shared/admin-page-header';
import { buttonVariants } from '@/components/ui/button-variants';
import { recallPatientName } from '@/lib/admin-patient-names';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { StaffConsentPanel } from './staff-consent-panel';

export function AdminPatientConsent({ patientId }: { readonly patientId: string }): ReactNode {
  const t = useT('consent.admin');
  // Read after mount (no sessionStorage on the server). The name is never put in the tab title (privacy).
  const [name, setName] = useState<string | undefined>(undefined);
  useEffect(() => setName(recallPatientName(patientId)), [patientId]);
  return (
    <>
      <AdminPageHeader title={t('title')} description={name === undefined ? t('nameUnknown') : t('openFor', { name })} action={<Link href="/admin/users" className={cn(buttonVariants({ variant: 'secondary' }))}>{t('back')}</Link>} />
      <StaffConsentPanel patientId={patientId} role="ADMIN" />
    </>
  );
}
