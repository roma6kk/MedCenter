import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { EncounterView } from '@/components/doctor/encounter-view';
import { pageMetadata } from '@/lib/i18n/page-metadata';

export const metadata: Metadata = pageMetadata('doctor.encounter.title');

export default async function EncounterPage({ params }: { readonly params: Promise<{ encounterId: string }> }): Promise<ReactNode> {
  const { encounterId } = await params;
  return <EncounterView encounterId={encounterId} />;
}
