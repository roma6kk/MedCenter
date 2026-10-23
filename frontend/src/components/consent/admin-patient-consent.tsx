'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { AdminPageHeader } from '@/components/admin/shared/admin-page-header';
import { buttonVariants } from '@/components/ui/button-variants';
import { useT } from '@/lib/i18n/use-t';
import { cn } from '@/lib/ui/cn';
import { StaffConsentPanel } from './staff-consent-panel';

/**
 * `/admin/patients/[patientId]/consent`: what ADMIN sees of a patient (ADR-018): the consent paperwork only. The patient's
 * card, history and prescriptions are medical data and are never read here.
 */
export function AdminPatientConsent({ patientId }: { readonly patientId: string }): ReactNode {
  const t = useT('consent.admin');
  return (
    <>
      <AdminPageHeader title={t('title')} action={<Link href="/admin/users" className={cn(buttonVariants({ variant: 'secondary' }))}>{t('back')}</Link>} />
      <StaffConsentPanel patientId={patientId} role="ADMIN" />
    </>
  );
}
