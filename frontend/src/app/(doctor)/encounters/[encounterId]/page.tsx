import type { ReactNode } from 'react';
import { EncounterView } from '@/components/doctor/encounter-view';

export default async function EncounterPage({ params }: { readonly params: Promise<{ encounterId: string }> }): Promise<ReactNode> {
  const { encounterId } = await params;
  return <EncounterView encounterId={encounterId} />;
}
