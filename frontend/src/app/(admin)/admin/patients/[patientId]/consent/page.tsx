import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { AdminPatientConsent } from '@/components/consent/admin-patient-consent';
import { pageMetadata } from '@/lib/i18n/page-metadata';

/** The patient's name never goes into the tab title: it would show up in the history and the window list. */
export const metadata: Metadata = pageMetadata('consent.admin.title');

export default async function AdminPatientConsentPage({ params }: { readonly params: Promise<{ patientId: string }> }): Promise<ReactNode> {
  const { patientId } = await params;
  return <AdminPatientConsent patientId={patientId} />;
}
